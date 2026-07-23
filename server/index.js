const fs = require('fs');
const path = require('path');
const os = require('os');
console.log('SERVER STARTING - ACK V3 - Registering Sales Target Routes');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const {
    connectDB,
    connectDBWithRetry,
    isPoolConnected,
    startDbKeepAlive,
    sql,
    dbConfig,
} = require('./dbConfig');
const {
    resolvePricingAccessContext,
    getPricingAnchorJobs,
    jobBelongsToSessionDivision,
} = require('./lib/quotePricingAccess');
const multer = require('multer');
const { buildSmtpTransport, stripQuotes, getSmtpFromEmail } = require('./lib/smtpTransport');
const {
    removeExcludedFromEmailSet,
    filterNotificationEmails,
    isExcludedNotificationEmail,
} = require('./lib/notificationEmailExclusions');
const Tesseract = require('tesseract.js');
const multerMemory = multer({ storage: multer.memoryStorage() });
const { parseContactCardFromOcrText } = require('./parseContactOcr');
const { computeEnquiryWorkflowStatus } = require('./services/computeEnquiryWorkflowStatus');
const {
    insertConcernedSERows,
    replaceConcernedSERows,
    mapConcernedSEAssignmentsFromRows,
} = require('./lib/concernedSeAssignments.cjs');
const { buildDocumentsReceivedItems } = require('./lib/enquiryNotifyEmailHtml');
const {
    resolveQuoteAttachmentsBase,
    resolveEnquiryAttachmentsBase,
    resolveEnquiryUploadDestination,
    resolveEnquiryAttachmentVisibilityBase,
    resolveEnquiryUploadDestinationByVisibility,
    resolveWritableEnquiryUploadDestination,
    resolveLocalEnquiryAttachmentsRoot,
    sanitizeFolderName,
} = require('./lib/attachmentsRoot');
const { previewNextRequestNo, resolveRequestNoForCreate } = require('./lib/allocateRequestNo');

// Configure Nodemailer Transporter
console.log('--- Email Config ---');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('SMTP_FROM:', getSmtpFromEmail());
console.log('SMTP_PORT:', process.env.SMTP_PORT);
console.log('SMTP_ENCRYPTION:', process.env.SMTP_ENCRYPTION || '(not set)');

const transporter = buildSmtpTransport({ logger: true, debug: true });

async function normalizeEnquiryForLeadMeta(requestNo, txn = null) {
    const reqNoStr = String(requestNo ?? '').trim();
    if (!reqNoStr) return;
    const runner = txn ? new sql.Request(txn) : new sql.Request();
    runner.input('reqNo', sql.NVarChar, reqNoStr);
    await runner.query(`
        ;WITH RootList AS (
            SELECT
                ef.ID AS RootID,
                ef.ItemName AS RootName,
                CONCAT('L', ROW_NUMBER() OVER (ORDER BY ef.ID)) AS RootCode
            FROM EnquiryFor ef
            WHERE ef.RequestNo = @reqNo
              AND (ef.ParentID IS NULL OR ef.ParentID = 0)
        ),
        WalkUp AS (
            SELECT
                ef.ID AS NodeID,
                ef.ID AS CurrentID,
                ef.ParentID,
                0 AS Depth
            FROM EnquiryFor ef
            WHERE ef.RequestNo = @reqNo
            UNION ALL
            SELECT
                w.NodeID,
                p.ID AS CurrentID,
                p.ParentID,
                w.Depth + 1
            FROM WalkUp w
            INNER JOIN EnquiryFor p ON p.RequestNo = @reqNo AND p.ID = w.ParentID
            WHERE w.ParentID IS NOT NULL AND w.ParentID <> 0 AND w.Depth < 100
        ),
        NodeRoot AS (
            SELECT
                w.NodeID,
                r.RootID,
                r.RootName,
                r.RootCode,
                ROW_NUMBER() OVER (PARTITION BY w.NodeID ORDER BY w.Depth DESC, r.RootID) AS rn
            FROM WalkUp w
            INNER JOIN RootList r ON r.RootID = w.CurrentID
        )
        UPDATE ef
        SET
            LeadJobCode = nr.RootCode,
            LeadJobName = nr.RootName
        FROM EnquiryFor ef
        INNER JOIN NodeRoot nr ON nr.NodeID = ef.ID AND nr.rn = 1
        WHERE ef.RequestNo = @reqNo
        OPTION (MAXRECURSION 32767);
    `);
}

async function normalizeAllEnquiryForLeadMeta() {
    const reqs = await new sql.Request().query(`
        SELECT DISTINCT RequestNo
        FROM EnquiryFor
        WHERE RequestNo IS NOT NULL
    `);
    for (const r of (reqs.recordset || [])) {
        const reqNo = r.RequestNo;
        if (reqNo == null || String(reqNo).trim() === '') continue;
        await normalizeEnquiryForLeadMeta(String(reqNo));
    }
}

const sendEnquiryEmail = async (enquiryData, recipients, attachments = [], fromEmail = null, fromDisplayName = null) => {
    const to = filterNotificationEmails(Array.isArray(recipients.to) ? recipients.to : []);
    const cc = filterNotificationEmails(Array.isArray(recipients.cc) ? recipients.cc : []).filter(
        (e) => !to.includes(e),
    );
    if (!to.length && !cc.length) {
        console.log('No recipients for email.');
        return;
    }

    // Generate Attachment Links List
    let attachmentHtml = '';
    if (attachments && attachments.length > 0) {
        attachmentHtml = `
            <tr><td style="background-color: #d4edda; font-weight: bold;">Attachments:</td>
            <td>
                <ul style="margin: 0; padding-left: 20px;">
                    ${attachments.map(att => `
                        <li><a href="http://localhost:5000/api/attachments/${att.ID}" target="_blank">${att.FileName}</a></li>
                    `).join('')}
                </ul>
            </td></tr>
        `;
    }

    const formatDate = (date) => {
        if (!date) return '';
        return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
    };

    const from = fromEmail ? fromEmail : getSmtpFromEmail();

    const mailOptions = {
        from: from,
        to: to.join(','),
        cc: cc ? cc.join(',') : '',
        subject: `New Enquiry No.${enquiryData.RequestNo} dated: ${formatDate(enquiryData.EnquiryDate)}`,
        html: `
            <p>Dear Sir/Madam,</p>
            <p>Greetings !!!</p>
            <p>Please find given below, details pertaining to a customer Enquiry no. ${enquiryData.RequestNo} on ${formatDate(enquiryData.EnquiryDate)}. Please report closure in Enquiry Management System.</p>
            <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                <tr><td style="background-color: #d4edda; font-weight: bold;">Enquiry Ref No. :</td><td>${enquiryData.RequestNo}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Enquiry Date:</td><td>${formatDate(enquiryData.EnquiryDate)}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Received From:</td><td>${enquiryData.ReceivedFrom}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Category :</td><td>${enquiryData.EnquiryType}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Project Name:</td><td>${enquiryData.ProjectName}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Client Name:</td><td>${enquiryData.ClientName}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Consultant Name:</td><td>${enquiryData.ConsultantName}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Enquiry Details :</td><td>${enquiryData.DetailsOfEnquiry}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Due Date:</td><td>${formatDate(enquiryData.DueOn)}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Supplementary received with:</td><td>${buildDocumentsReceivedItems(enquiryData).join(', ') || enquiryData.OthersSpecify || enquiryData.DocumentsReceived || ''}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Remarks:</td><td>${enquiryData.Remark || ''}</td></tr>
                ${attachmentHtml}
            </table>
            <br/>
            <p>Thanx in advance,</p>
            <p>Best regards,</p>
            <p>* This is an Auto Generated E-mail by Enquiry Management System *</p>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};

// ... (keep existing code) ...

const splitEmails = (raw) =>
    String(raw || '')
        .split(/[;,]/g)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

// Optimized notification generation: bulk lookups + single-pass inserts.
// Recipients: enquiry creator, Concerned SE (assigned), Acknowledgement SE, AdditionalNotificationEmails,
// plus EnquiryFor Common/CC mails (mapped to Master_ConcernedSE users for in-app rows).
const createNotifications = async (requestNo, type, message, triggerUserEmail, triggerUserName) => {
    try {
        console.log('--- START NOTIFICATION GENERATION ---');
        console.log(`Request: ${requestNo}, Type: ${type}, Trigger: ${triggerUserName} (${triggerUserEmail})`);

        const recipientEmails = new Set();

        const enqMeta = await sql.query`
            SELECT CreatedBy, AcknowledgementSE, AdditionalNotificationEmails
            FROM EnquiryMaster WHERE RequestNo = ${requestNo}
        `;
        const meta = enqMeta.recordset?.[0] || {};
        const createdBy = String(meta.CreatedBy || '').trim();
        const acknowledgementSE = String(meta.AcknowledgementSE || '').trim();
        const additionalRaw = meta.AdditionalNotificationEmails;

        // 1a) Concerned SE (assigned on enquiry) — case-insensitive name match to Master_ConcernedSE
        const seJoined = await sql.query`
            SELECT DISTINCT LOWER(LTRIM(RTRIM(m.EmailId))) AS EmailIdNorm
            FROM ConcernedSE cs
            INNER JOIN Master_ConcernedSE m
              ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
            WHERE cs.RequestNo = ${requestNo}
              AND LTRIM(RTRIM(ISNULL(m.EmailId, N''))) <> N''
        `;
        for (const row of seJoined.recordset || []) {
            if (row.EmailIdNorm) {
                recipientEmails.add(row.EmailIdNorm);
            }
        }

        // 1b) Creator (CreatedBy is typically FullName; allow email match if stored as email)
        if (createdBy) {
            if (createdBy.includes('@')) {
                recipientEmails.add(createdBy.toLowerCase());
            } else {
                const cbRes = await sql.query`
                    SELECT LOWER(LTRIM(RTRIM(EmailId))) AS EmailIdNorm
                    FROM Master_ConcernedSE
                    WHERE UPPER(LTRIM(RTRIM(ISNULL(FullName, N'')))) = UPPER(LTRIM(RTRIM(${createdBy})))
                      AND LTRIM(RTRIM(ISNULL(EmailId, N''))) <> N''
                `;
                for (const row of cbRes.recordset || []) {
                    if (row.EmailIdNorm) {
                        recipientEmails.add(row.EmailIdNorm);
                    }
                }
            }
        }

        // 1c) Acknowledgement SE (same robust name match)
        if (acknowledgementSE) {
            const ackRes = await sql.query`
                SELECT LOWER(LTRIM(RTRIM(EmailId))) AS EmailIdNorm
                FROM Master_ConcernedSE
                WHERE UPPER(LTRIM(RTRIM(ISNULL(FullName, N'')))) = UPPER(LTRIM(RTRIM(${acknowledgementSE})))
                  AND LTRIM(RTRIM(ISNULL(EmailId, N''))) <> N''
            `;
            for (const row of ackRes.recordset || []) {
                if (row.EmailIdNorm) {
                    recipientEmails.add(row.EmailIdNorm);
                }
            }
        }

        // 1d) Additional notification emails (semicolon/comma separated)
        splitEmails(additionalRaw).forEach((e) => recipientEmails.add(e));

        // 2) EnquiryFor ItemName -> Common/CC mail ids (bulk)
        const itemRes = await sql.query`SELECT ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        const itemNames = [...new Set((itemRes.recordset || []).map((r) => String(r.ItemName || '').trim()).filter(Boolean))];
        if (itemNames.length > 0) {
            const req = new sql.Request();
            const params = [];
            itemNames.forEach((name, i) => {
                const p = `it${i}`;
                req.input(p, sql.NVarChar, name);
                params.push(`@${p}`);
            });
            const masterRes = await req.query(`
                SELECT ItemName, CommonMailIds, CCMailIds
                FROM Master_EnquiryFor
                WHERE LTRIM(RTRIM(ItemName)) IN (${params.join(', ')})
            `);
            for (const row of masterRes.recordset || []) {
                splitEmails(row.CommonMailIds).forEach((e) => recipientEmails.add(e));
                splitEmails(row.CCMailIds).forEach((e) => recipientEmails.add(e));
            }
        }

        // 3) Remove trigger user and globally excluded addresses
        if (triggerUserEmail) {
            recipientEmails.delete(String(triggerUserEmail).trim().toLowerCase());
        }
        removeExcludedFromEmailSet(recipientEmails);

        const finalEmails = [...recipientEmails];
        console.log('Final Recipient List:', finalEmails);
        if (finalEmails.length === 0) {
            console.log('--- END NOTIFICATION GENERATION (no recipients) ---');
            return;
        }

        // 4) Resolve UserIDs in one query
        const userReq = new sql.Request();
        const emailParams = [];
        finalEmails.forEach((email, i) => {
            const p = `e${i}`;
            userReq.input(p, sql.NVarChar, email);
            emailParams.push(`@${p}`);
        });
        const users = await userReq.query(`
            SELECT ID, LOWER(LTRIM(RTRIM(EmailId))) AS EmailIdNorm
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(EmailId))) IN (${emailParams.join(', ')})
        `);
        const now = new Date();
        for (const u of users.recordset || []) {
            await sql.query`
                INSERT INTO Notifications (UserID, Type, Message, LinkID, CreatedBy, CreatedAt)
                VALUES (${u.ID}, ${type}, ${message}, ${requestNo}, ${triggerUserName}, ${now})
            `;
            console.log(`Notification inserted for UserID: ${u.ID} (${u.EmailIdNorm})`);
        }

        console.log('--- END NOTIFICATION GENERATION ---');
    } catch (e) {
        console.error('CRITICAL ERROR creating notifications:', e);
    }
};

const queueCreateNotifications = (requestNo, type, message, triggerUserEmail, triggerUserName) => {
    setImmediate(() => {
        createNotifications(requestNo, type, message, triggerUserEmail, triggerUserName).catch((e) => {
            console.error('queueCreateNotifications error:', e);
        });
    });
};

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configure Multer Storage (Memory Storage for DB)
// Configure Multer Storage (Disk Storage)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const enquiryAttachmentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            const visibility = req.query.visibility || 'Public';
            const division = req.query.division || 'General';
            const { dest, usedFallback, primaryAttempted } = resolveWritableEnquiryUploadDestination(
                req.query.requestNo,
                visibility,
                division
            );
            req._attachmentUploadDest = dest;
            req._attachmentUsedLocalFallback = usedFallback;
            if (usedFallback) {
                req._attachmentPrimaryAttempted = primaryAttempted;
            }
            cb(null, dest);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const safe = String(file.originalname || 'file').replace(/[/\\?%*:|"<>]/g, '_');
        cb(null, Date.now() + '-' + safe);
    }
});
const uploadEnquiryAttachments = multer({
    storage: enquiryAttachmentStorage,
    limits: { fileSize: 100 * 1024 * 1024 },
});

function runEnquiryAttachmentUpload(req, res, next) {
    uploadEnquiryAttachments.array('files')(req, res, (err) => {
        if (!err) return next();
        console.error('[attachments/upload] Multer error:', err);
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 500;
        return res.status(status).json({
            message:
                err.code === 'LIMIT_FILE_SIZE'
                    ? 'File exceeds the 100 MB upload limit.'
                    : err.message || 'File upload failed',
            code: err.code || 'UPLOAD_ERROR',
            hint: 'Verify ENQUIRY_ATTACHMENTS_ROOT or use local storage under EMS/data/ems-attachments.',
        });
    });
}

function formatRouteError(err) {
    const sqlDetail = err?.originalError?.info?.message;
    const message =
        (err && err.message) ||
        (typeof err === 'string' ? err : null) ||
        sqlDetail ||
        'Server Error';
    return {
        message,
        code: err?.code || null,
        sqlError: sqlDetail || null,
    };
}
const app = express();
const PORT = process.env.PORT || 5001;

// DEBUG ROUTE
app.get('/api/debug/check-user-status', async (req, res) => {
    const email = 'bmselveng1@almoayyedcg.com';
    try {
        // Ensure we are connected
        if (!isPoolConnected()) {
            await connectDB();
        }

        const pool = await sql.connect(dbConfig); // dbConfig is exported from dbConfig.js
        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM Master_ConcernedSE WHERE EmailId = @email');

        const similar = await pool.request()
            .input('part', sql.NVarChar, '%' + email.split('@')[0] + '%')
            .query('SELECT FullName, EmailId FROM Master_ConcernedSE WHERE EmailId LIKE @part');

        res.json({
            target: email,
            found: result.recordset.length > 0,
            directMatch: result.recordset[0] || null,
            similar: similar.recordset,
            count: result.recordset.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve uploaded files from server/uploads
app.use('/fonts', express.static(path.join(__dirname, '../public/fonts'))); // Inter etc. for quote PDF (Puppeteer)

// Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    // console.log('Body:', JSON.stringify(req.body, null, 2)); // Reduce noise
    next();
});

/** Lightweight probe for IIS/PM2 — separate from quote-pdf Puppeteer health. */
app.get('/api/health', async (req, res) => {
    try {
        if (!isPoolConnected()) {
            await connectDB();
        }
        await sql.query`SELECT 1 AS ok`;
        res.json({ ok: true, db: true, uptimeSec: Math.round(process.uptime()) });
    } catch (err) {
        console.error('[health] DB check failed:', err?.message || err);
        res.status(503).json({ ok: false, db: false, error: err?.message || 'Database unavailable' });
    }
});

/** IT diagnostic: verify Node/PM2 can write to enquiry attachment UNC (not the same as your RDP login). */
app.get('/api/system/attachment-storage-probe', (req, res) => {
    try {
        const requestNo = req.query.requestNo || 'probe';
        const visibility = req.query.visibility || 'Public';
        const division = req.query.division || 'General';
        const resolved = resolveWritableEnquiryUploadDestination(requestNo, visibility, division);
        const dest = resolved.dest;
        const probeFile = path.join(dest, `.ems-write-probe-${Date.now()}.tmp`);
        const userInfo = (() => {
            try {
                return os.userInfo();
            } catch {
                return { username: process.env.USERNAME || process.env.USER || 'unknown' };
            }
        })();

        const result = {
            ok: false,
            processUser: userInfo.username,
            enquiryAttachmentsRoot: resolveEnquiryAttachmentsBase(),
            localFallbackRoot: resolveLocalEnquiryAttachmentsRoot(),
            publicBase: resolveEnquiryAttachmentVisibilityBase('Public'),
            privateBase: resolveEnquiryAttachmentVisibilityBase('Private'),
            resolvedDestination: dest,
            usedLocalFallback: resolved.usedFallback,
            primaryAttempted: resolved.primaryAttempted || null,
            probeFile,
            steps: [],
        };

        const step = (name, ok, detail) => {
            result.steps.push({ name, ok, detail: detail || null });
            if (!ok) result.error = detail || name;
        };

        try {
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
                step('mkdir', true, dest);
            } else {
                step('mkdir', true, 'already exists');
            }
        } catch (err) {
            step('mkdir', false, err.message);
            return res.status(500).json(result);
        }

        try {
            fs.writeFileSync(probeFile, `ems probe ${new Date().toISOString()}`);
            step('write', true, probeFile);
        } catch (err) {
            step('write', false, err.message);
            return res.status(500).json(result);
        }

        try {
            fs.unlinkSync(probeFile);
            step('delete', true, null);
        } catch (err) {
            step('delete', false, err.message);
            return res.status(500).json(result);
        }

        result.ok = true;
        result.hint =
            'If this fails but you can create files in RDP, grant Modify on the UNC share to the processUser account (PM2 service identity).';
        return res.json(result);
    } catch (err) {
        console.error('[attachment-storage-probe]', err);
        return res.status(500).json({
            ok: false,
            message: err.message || 'Probe failed',
            processUser: (() => {
                try {
                    return os.userInfo().username;
                } catch {
                    return process.env.USERNAME || 'unknown';
                }
            })(),
        });
    }
});

// NEW ROUTE HERE - Moved to top to ensure availability
app.get('/api/master/divisions', async (req, res) => {
    try {
        console.log('[API] /api/master/divisions HIT (Top Level)');
        // Fetch unique DepartmentName from Master_EnquiryFor
        const result = await sql.query`
            SELECT DISTINCT DepartmentName 
            FROM Master_EnquiryFor 
            WHERE DepartmentName IS NOT NULL AND DepartmentName <> '' 
            ORDER BY DepartmentName ASC
        `;

        const divisions = result.recordset.map(row => row.DepartmentName);
        console.log(`[API] Found ${divisions.length} divisions:`, divisions);
        res.json(divisions);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// Upload Logo (Defined early to avoid Router conflicts)
app.post('/api/upload/logo', (req, res, next) => {
    console.log('Hitting /api/upload/logo');
    const uploadDir = path.join(__dirname, 'uploads', 'logos');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    next();
}, upload.single('logo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        // Move file from uploads/ to uploads/logos/ because multer uploads to base dir
        const oldPath = req.file.path;
        const newPath = path.join(__dirname, 'uploads', 'logos', req.file.filename);
        fs.renameSync(oldPath, newPath);

        const relativePath = `uploads/logos/${req.file.filename}`;
        res.json({ message: 'Logo uploaded', filePath: relativePath });
    } catch (err) {
        console.error('Error uploading logo:', err);
        res.status(500).json({ message: 'Server error during upload' });
    }
});

// New RAG & Chat API Routes
const apiRoutes = require('./routes/api');
const dashboardRoutes = require('./routes/dashboard'); // New Dashboard Routes
const pricingRoutes = require('./routes/pricing'); // Pricing Module Routes
const quotesRoutes = require('./routes/quotes'); // Quote Module Routes
const quotePdfRoutes = require('./routes/quotePdf');
app.use('/api', apiRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/quote-pdf', quotePdfRoutes);
const probabilityRoutes = require('./routes/probabilityRoutes');
app.use('/api/probability', probabilityRoutes);
const salesReportRoutes = require('./routes/salesReportRoutes');
app.use('/api/sales-report', salesReportRoutes);
const salesTargetRoutes = require('./routes/salesTargetRoutes');
app.use('/api/sales-targets', salesTargetRoutes);


// --- OCR Extraction Route ---
app.post('/api/extract-contact-ocr', multerMemory.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' });
    }

    try {
        console.log('Processing OCR for image size:', req.file.size);
        const { data: { text } } = await Tesseract.recognize(req.file.buffer, 'eng');
        console.log('OCR Output:', text);

        const parsed = parseContactCardFromOcrText(text);
        res.json({
            ...parsed,
            RawText: text
        });

    } catch (err) {
        console.error('OCR Error:', err);
        res.status(500).json({ error: 'Failed to process image' });
    }
});

// --- Authentication Routes ---
const PASSWORD_POLICY_MESSAGE = 'Password must be at least 10 characters and include uppercase, lowercase, number, and special character.';

const isPasswordComplex = (password = '') => {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/.test(password);
};

const generateCompliantTempPassword = () => {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const all = `${upper}${lower}${numbers}${special}`;

    const pick = (charset) => charset[Math.floor(Math.random() * charset.length)];
    let temp = `${pick(upper)}${pick(lower)}${pick(numbers)}${pick(special)}`;
    while (temp.length < 12) {
        temp += pick(all);
    }
    return temp;
};

// Self-registration disabled — only pre-provisioned Master_ConcernedSE emails may sign in.
app.post('/api/auth/signup', (_req, res) => {
    res.status(403).json({
        message: 'Self-registration is not available. Please contact your administrator.',
    });
});

// User Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Find user
        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        const user = result.recordset[0];

        if (!user) {
            console.log('Login failed: User not found for', email);
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Check password
        // Check password
        const isMatch = await bcrypt.compare(password, user.LoginPassword);
        if (!isMatch) {
            console.log('Login failed: Password mismatch for', email);
            console.log(`Debug: Input PW Len: ${password.length}, Hash: ${user.LoginPassword}`);
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Return user info (excluding password)
        const { LoginPassword, ...userWithoutPassword } = user;

        // Department must come from Master_ConcernedSE (user row), not from an unrelated enquiry's EnquiryFor.

        // Force Admin for ranigovardhan@gmail.com
        if (email.toLowerCase() === 'ranigovardhan@gmail.com') {
            userWithoutPassword.Roles = 'Admin';
            userWithoutPassword.role = 'Admin';
        }
        // Ensure ProfileImage is included (it allows NULL)
        res.json({ user: userWithoutPassword });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// Profile by login email — authoritative Department / roles from Master_ConcernedSE
app.get('/api/auth/profile', async (req, res) => {
    const email = (req.query.email || '').trim();
    if (!email) {
        return res.status(400).json({ message: 'email query required' });
    }
    try {
        const result = await sql.query`SELECT ID, FullName, EmailId, Department, Designation, Roles, Status, RequestNo, ProfileImage, MobileNumber FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        const row = result.recordset[0];
        if (!row) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(row);
    } catch (err) {
        console.error('Profile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Check if user exists and flow requirement
app.post('/api/auth/check-user', async (req, res) => {
    const { email } = req.body;
    console.log('=== CHECK USER REQUEST ===');
    console.log('Email received:', email);
    console.log('Email type:', typeof email);
    console.log('Email length:', email ? email.length : 0);

    try {
        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        console.log('Query result count:', result.recordset.length);

        if (result.recordset.length > 0) {
            console.log('User found:', result.recordset[0].FullName, result.recordset[0].EmailId);
        } else {
            console.log('No user found with email:', email);
            // Try to find similar emails
            const similarResult = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE EmailId LIKE ${'%' + email.split('@')[0] + '%'}`;
            const similarEmails = similarResult.recordset.map(r => r.EmailId);
            console.log('Similar emails found:', similarEmails);
            fs.appendFileSync('debug_auth.log', `[${new Date().toISOString()}] Email: ${email}, Similar: ${JSON.stringify(similarEmails)}\n`);
        }

        const user = result.recordset[0];

        if (!user) {
            return res.json({ exists: false });
        }

        // Check if first time login (no password set)
        const isFirstLogin = !user.LoginPassword || user.LoginPassword === '';
        console.log('Is first login:', isFirstLogin);
        res.json({ exists: true, isFirstLogin });
    } catch (err) {
        console.error('Check user error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Set Password
app.post('/api/auth/set-password', async (req, res) => {
    const { email, newPassword } = req.body;
    try {
        if (!isPasswordComplex(newPassword)) {
            return res.status(400).json({ message: PASSWORD_POLICY_MESSAGE });
        }

        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        const user = result.recordset[0];

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await sql.query`UPDATE Master_ConcernedSE SET LoginPassword = ${hashedPassword} WHERE EmailId = ${email}`;

        // Return user info for auto-login
        const { LoginPassword, ...userWithoutPassword } = user;
        // Update userWithoutPassword with new info? Actually just returning basic info is enough or trigger login on frontend
        // Assuming frontend will auto-login or ask to login. Let's return success.
        res.json({ message: 'Password set successfully' });
    } catch (err) {
        console.error('Set password error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        const user = result.recordset[0];

        if (!user) {
            // Don't reveal user existence? Or for this internal tool it's fine.
            return res.status(404).json({ message: 'User not found' });
        }

        // In a real app, generate token + send email.
        // Here we will simulate by sending a temp password or just a link.
        // Since we don't have a reset page route yet, let's just send a generic email saying "Contact Admin" or similar, 
        // OR truly implement it. 
        // User requirement: "ability to reset password by forgot password option".
        // Let's generate a temporary password and email it.

        const tempPassword = generateCompliantTempPassword();
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(tempPassword, salt);

        await sql.query`UPDATE Master_ConcernedSE SET LoginPassword = ${hashedPassword} WHERE EmailId = ${email}`;

        const mailOptions = {
            from: getSmtpFromEmail(),
            to: email,
            subject: 'EMS Portal - Password Reset',
            html: `<p>Your password has been temporarily reset to: <strong>${tempPassword}</strong></p><p>Please login and change it if needed (feature pending) or use this to login.</p>`
        };

        try {
            await transporter.sendMail(mailOptions);
            res.json({ message: 'Temporary password sent to email.' });
        } catch (mailErr) {
            console.error('Mail error:', mailErr);
            res.status(500).json({ message: 'Failed to send reset email.' });
        }

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Change Password (Authenticated)
app.post('/api/auth/change-password', async (req, res) => {
    const { userId, currentPassword, newPassword } = req.body;

    try {
        if (!isPasswordComplex(newPassword)) {
            return res.status(400).json({ message: PASSWORD_POLICY_MESSAGE });
        }

        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE ID = ${userId}`;
        const user = result.recordset[0];

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.LoginPassword);
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect current password' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await sql.query`UPDATE Master_ConcernedSE SET LoginPassword = ${hashedPassword} WHERE ID = ${userId}`;

        // Send Notification Email
        if (user.EmailId && !isExcludedNotificationEmail(user.EmailId)) {
            const mailOptions = {
                from: getSmtpFromEmail(),
                to: user.EmailId,
                subject: 'Security Alert: Password Changed',
                html: `
                    <p>Dear ${user.FullName},</p>
                    <p>Your password for the EMS Portal has been successfully changed.</p>
                    <p>If you did not perform this action, please contact the administrator immediately.</p>
                `
            };
            transporter.sendMail(mailOptions).catch(err => console.error('Failed to send password change notification:', err));
        }

        res.json({ message: 'Password changed successfully' });

    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- API Routes ---

function normalizeEmail(e) {
    return String(e || '').trim().toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
}

function roleIsAdmin(roleString) {
    const rs = roleString || '';
    const roles = typeof rs === 'string'
        ? rs.split(',').map(r => r.trim().toLowerCase())
        : (Array.isArray(rs) ? rs.map(r => String(r).trim().toLowerCase()) : []);
    return roles.includes('admin') || roles.includes('system');
}

function splitMailList(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/;/g, ',')
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);
}

function stripJobPrefix(s) {
    return String(s || '').replace(/^(L\d+\s*-\s*|Sub Job\s*-\s*)/i, '').trim();
}

async function resolveEnquiryVisibilityContext({ userEmail, userName, userRole }) {
    const email = normalizeEmail(userEmail);
    const isAdmin = roleIsAdmin(userRole) || email === 'ranigovardhan@gmail.com';
    if (isAdmin) return { isAdmin: true, accessMode: 'all', fullName: (userName || '').toString().trim(), email };
    if (!email) return { isAdmin: false, accessMode: 'assigned', fullName: (userName || '').toString().trim(), email: '' };

    const [userRes, ccRes, deptRes] = await Promise.all([
        sql.query`
            SELECT TOP 1 FullName, Department
            FROM Master_ConcernedSE
            WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) = ${email}
        `,
        sql.query`
            SELECT TOP 1 1 AS ok
            FROM Master_EnquiryFor
            WHERE ',' + REPLACE(REPLACE(ISNULL(CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${`%,${email},%`}
        `,
        sql.query`
            SELECT TOP 1 1 AS ok
            FROM Master_ConcernedSE
            WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) = ${email}
              AND LOWER(LTRIM(RTRIM(ISNULL(Department, N'')))) = N'management'
        `
    ]);
    const fullName = (userRes.recordset?.[0]?.FullName || userName || '').toString().trim();
    const isCcUser = (ccRes.recordset?.length || 0) > 0 || (deptRes.recordset?.length || 0) > 0;
    return { isAdmin: false, accessMode: isCcUser ? 'department' : 'assigned', fullName, email };
}

// Get All Enquiries
app.get('/api/enquiries', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const userEmail = req.query.userEmail || '';
        const userName = req.query.userName || '';
        const userRole = req.query.userRole || '';
        const listScope = String(req.query.listScope || '').trim().toLowerCase();
        const showAllEnquiries = listScope === 'all' || listScope === 'search';
        const vis = await resolveEnquiryVisibilityContext({ userEmail, userName, userRole });

        const result = await sql.query`SELECT * FROM EnquiryMaster ORDER BY CreatedAt DESC`;

        // Fetch related data
        const customersResult = await sql.query`SELECT * FROM EnquiryCustomer`;
        const contactsResult = await sql.query`SELECT * FROM ReceivedFrom`;
        const typesResult = await sql.query`SELECT * FROM EnquiryType`;
        const itemsResult = await sql.query`SELECT * FROM EnquiryFor`;
        const seResult = await sql.query`SELECT * FROM ConcernedSE`;
        const consultantsResult = await sql.query`SELECT * FROM EnquiryConsultant`;
        const masterEnqForRes = (!vis.isAdmin && vis.email)
            ? await sql.query`SELECT ItemName, CCMailIds FROM Master_EnquiryFor`
            : { recordset: [] };

        // Precompute visibility by RequestNo (ConcernedSE ↔ Master email — not display-name string compare)
        let allowedReqNos = null;
        if (!vis.isAdmin && vis.email && !showAllEnquiries) {
            const normEmail = normalizeEmail(vis.email);
            const assignedRes = await sql.query`
                SELECT DISTINCT LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) AS RequestNo
                FROM ConcernedSE cs
                INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) = ${normEmail}
                  AND LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) <> N''
            `;
            let assignedSet = new Set(
                (assignedRes.recordset || [])
                    .map(r => String(r.RequestNo || '').trim())
                    .filter(Boolean)
            );

            if (vis.accessMode === 'department') {
                const emailLower = vis.email;
                const masterRows = (masterEnqForRes.recordset || []).map(r => ({
                    itemName: String(r.ItemName || '').trim(),
                    itemKey: stripJobPrefix(r.ItemName).toLowerCase(),
                    ccMails: splitMailList(r.CCMailIds).map(m => normalizeEmail(m))
                }));
                const masterByKey = new Map();
                masterRows.forEach(r => {
                    if (!r.itemKey) return;
                    const list = masterByKey.get(r.itemKey) || [];
                    list.push(r);
                    masterByKey.set(r.itemKey, list);
                });

                const deptSet = new Set();
                (itemsResult.recordset || []).forEach(ef => {
                    const reqNo = String(ef.RequestNo || '').trim();
                    if (!reqNo) return;
                    const efKey = stripJobPrefix(ef.ItemName).toLowerCase();
                    const candidates = masterByKey.get(efKey) || [];
                    if (candidates.some(c => c.ccMails.includes(emailLower))) {
                        deptSet.add(reqNo);
                    }
                });

                allowedReqNos = new Set([...assignedSet, ...deptSet]);
            } else {
                let assignedOnly = assignedSet;
                const ctx = await resolvePricingAccessContext(vis.email);
                if (ctx.user && !ctx.isCcUser) {
                    const narrowed = new Set();
                    for (const reqNo of assignedSet) {
                        const jobs = (itemsResult.recordset || []).filter(i => String(i.RequestNo || '').trim() === reqNo);
                        const jobRows = jobs.map(j => ({
                            ID: j.ID,
                            ParentID: j.ParentID,
                            ItemName: j.ItemName,
                            CCMailIds: undefined,
                        }));
                        if (getPricingAnchorJobs(jobRows, ctx, vis.email).length > 0) {
                            narrowed.add(reqNo);
                        }
                    }
                    assignedOnly = narrowed;
                }
                allowedReqNos = assignedOnly;
            }
        }

        const enquiries = result.recordset.map(enq => {
            const reqNo = enq.RequestNo;

            const relatedCustomers = customersResult.recordset.filter(c => c.RequestNo === reqNo).map(c => c.CustomerName);
            const relatedContacts = contactsResult.recordset.filter(c => c.RequestNo === reqNo).map(c => `${c.ContactName}|${c.CompanyName || ''}`);
            const relatedTypes = typesResult.recordset.filter(t => t.RequestNo === reqNo).map(t => t.TypeName);
            const relatedConsultants = consultantsResult.recordset.filter(c => c.RequestNo === reqNo).map(c => c.ConsultantName);
            // Use full object for hierarchy
            const relatedItemsRaw = itemsResult.recordset.filter(i => i.RequestNo === reqNo);
            const relatedItemsStructured = relatedItemsRaw.map(i => ({
                id: i.ID,
                parentId: i.ParentID,
                itemName: i.ItemName,
                leadJobCode: i.LeadJobCode,
                parentName: i.ParentItemName
            }));
            const relatedItemsDisplay = relatedItemsRaw.map(i => i.ItemName);

            const relatedSEs = seResult.recordset.filter(s => s.RequestNo === reqNo).map(s => s.SEName);
            const relatedSEAssignments = mapConcernedSEAssignmentsFromRows(
                seResult.recordset.filter(s => s.RequestNo === reqNo)
            );

            return {
                ...enq,
                SelectedEnquiryTypes: relatedTypes,
                SelectedEnquiryFor: relatedItemsStructured, // Pass structure
                SelectedCustomers: relatedCustomers,
                SelectedReceivedFroms: relatedContacts,
                SelectedConcernedSEs: relatedSEs,
                ConcernedSEAssignments: relatedSEAssignments,
                SelectedConsultants: relatedConsultants,
                // Legacy fields for backward compatibility & List View
                EnquiryType: relatedTypes.join(', '),
                EnquiryFor: relatedItemsDisplay.join(', '),
                CustomerName: enq.CustomerName || relatedCustomers.join(', '), // Prefer Master, fallback to transaction
                ClientName: enq.ClientName,
                ConsultantName: enq.ConsultantName || relatedConsultants.join(', '),
                ReceivedFrom: relatedContacts.map(c => c.split('|')[0]).join(', '),
                ConcernedSE: relatedSEs.join(', '),
                SourceOfInfo: enq.SourceOfEnquiry,
                DueOn: enq.DueDate
            };
        });

        // Apply visibility filter (non-admin only)
        const visibleEnquiries = (allowedReqNos && allowedReqNos.size >= 0)
            ? enquiries.filter(e => allowedReqNos.has(String(e.RequestNo || '').trim()))
            : enquiries;

        // Search Filter
        const search = req.query.search ? req.query.search.toLowerCase() : null;
        console.log(`[GET /api/enquiries] Search term: '${search}'`);

        let filteredEnquiries = search
            ? visibleEnquiries.filter(e => {
                const reqNo = e.RequestNo ? String(e.RequestNo).toLowerCase() : '';
                const projName = e.ProjectName ? e.ProjectName.toLowerCase() : '';
                const custName = e.CustomerName ? e.CustomerName.toLowerCase() : '';
                return reqNo.includes(search) || projName.includes(search) || custName.includes(search);
            })
            : visibleEnquiries;

        const sessionDivision = String(req.query.division || '').trim();
        const enforceDivisionOnSearch =
            req.query.enforceDivision === '1' ||
            String(req.query.enforceDivision || '').toLowerCase() === 'true';

        if (enforceDivisionOnSearch && sessionDivision && filteredEnquiries.length > 0) {
            const reqNos = [
                ...new Set(
                    filteredEnquiries
                        .map((e) => String(e.RequestNo || '').trim())
                        .filter(Boolean)
                ),
            ];
            const efReq = new sql.Request();
            reqNos.forEach((no, i) => efReq.input(`rn${i}`, sql.NVarChar, no));
            const placeholders = reqNos.map((_, i) => `@rn${i}`).join(', ');
            const efJoined = await efReq.query(`
                SELECT ef.RequestNo, ef.ID, ef.ItemName, mef.DepartmentName
                FROM EnquiryFor ef
                LEFT JOIN Master_EnquiryFor mef ON (
                    ef.ItemName = mef.ItemName OR
                    ef.ItemName LIKE '% - ' + mef.ItemName OR
                    ef.ItemName LIKE '%- ' + mef.ItemName OR
                    ef.ItemName LIKE mef.ItemName + ' %' OR
                    (mef.DepartmentName IS NOT NULL AND mef.DepartmentName <> '' AND ef.ItemName LIKE '%' + mef.DepartmentName + '%')
                )
                WHERE ef.RequestNo IN (${placeholders})
            `);
            const seenItemIds = new Set();
            const divisionMatchByReq = new Map();
            for (const row of efJoined.recordset || []) {
                const reqNo = String(row.RequestNo || '').trim();
                const itemId = row.ID;
                if (!reqNo || itemId == null) continue;
                const dedupeKey = `${reqNo}|${itemId}`;
                if (seenItemIds.has(dedupeKey)) continue;
                seenItemIds.add(dedupeKey);
                if (
                    jobBelongsToSessionDivision(
                        { ItemName: row.ItemName, DepartmentName: row.DepartmentName },
                        sessionDivision
                    )
                ) {
                    divisionMatchByReq.set(reqNo, true);
                }
            }
            filteredEnquiries = filteredEnquiries.filter((e) =>
                divisionMatchByReq.get(String(e.RequestNo || '').trim())
            );
        }

        console.log(`[GET /api/enquiries] Total filtered items: ${filteredEnquiries.length}`);
        if (search && filteredEnquiries.length === 0) {
            console.log('[GET /api/enquiries] No matches found. Sample IDs:', enquiries.slice(0, 3).map(e => e.RequestNo));
        }

        res.json(filteredEnquiries);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

const enquiryOutlookRoutes = require('./routes/enquiryOutlook');
app.use('/api/enquiries', enquiryOutlookRoutes);

/** Must be registered before `/api/enquiries/:id` so `check-project-name` is not captured as an id. */
app.get('/api/enquiries/check-project-name', async (req, res) => {
    try {
        const projectName = String(req.query.projectName || '').trim();
        const excludeRequestNo = String(req.query.excludeRequestNo || '').trim();
        if (!projectName) {
            return res.json({ exists: false });
        }
        const key = projectName.toLowerCase();
        const r = new sql.Request();
        r.input('pnKey', sql.NVarChar, key);
        let result;
        if (excludeRequestNo) {
            r.input('excludeNo', sql.NVarChar, excludeRequestNo);
            result = await r.query(`
                SELECT TOP 1 RequestNo FROM EnquiryMaster
                WHERE LTRIM(RTRIM(LOWER(ProjectName))) = @pnKey AND RequestNo <> @excludeNo
            `);
        } else {
            result = await r.query(`
                SELECT TOP 1 RequestNo FROM EnquiryMaster
                WHERE LTRIM(RTRIM(LOWER(ProjectName))) = @pnKey
            `);
        }
        const row = result.recordset[0];
        return res.json({ exists: !!row, requestNo: row ? row.RequestNo : null });
    } catch (err) {
        console.error('check-project-name:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Add Enquiry
app.post('/api/enquiries', async (req, res) => {
    const logFile = path.join(__dirname, 'debug.log');
    const log = (msg) => {
        if (process.env.ENQUIRY_DEBUG_LOG !== '1') return;
        fs.appendFile(logFile, `${new Date().toISOString()} - ${msg}\n`, () => {});
    };

    try {
        log(`POST /api/enquiries Body: ${JSON.stringify(req.body, null, 2)}`);

        let transaction;
        const {
            SourceOfInfo, EnquiryDate, DueOn, SiteVisitDate,
            SelectedEnquiryTypes, SelectedEnquiryFor,
            SelectedCustomers, SelectedReceivedFroms, SelectedConcernedSEs, ConcernedSEAssignments,
            ProjectName, ClientName, ConsultantName, SelectedConsultants, DetailsOfEnquiry,
            DocumentsReceived, hardcopy, drawing, dvd, spec, eqpschedule, Remark,
            AutoAck, ceosign, Status, AcknowledgementSE, AdditionalNotificationEmails, CustomerRefNo
        } = req.body;

        const clientRequestNo = req.body.RequestNo ? req.body.RequestNo.trim() : '';
        if (clientRequestNo) {
            log(`Ignoring client RequestNo preview on create: ${clientRequestNo}`);
        }

        log(`AutoAck Value: ${AutoAck}, Type: ${typeof AutoAck}`);
        log(`SelectedCustomers: ${JSON.stringify(SelectedCustomers)}`);

        const pnTrim = (ProjectName || '').trim();
        if (pnTrim) {
            const dupProj = await sql.query`
                SELECT TOP 1 RequestNo FROM EnquiryMaster
                WHERE LTRIM(RTRIM(LOWER(ProjectName))) = ${pnTrim.toLowerCase()}
            `;
            if (dupProj.recordset.length > 0) {
                log(`Duplicate ProjectName on create: ${pnTrim}`);
                return res.status(400).json({
                    message: 'Duplicate Project Name',
                    error: 'already Project name is exist',
                });
            }
        }

        transaction = new sql.Transaction();
        await transaction.begin();

        const RequestNo = await resolveRequestNoForCreate(transaction);
        log(`Allocated RequestNo: ${RequestNo} on create`);

        const request = new sql.Request(transaction);
        request.input('RequestNo', sql.NVarChar, RequestNo);
        request.input('SourceOfEnquiry', sql.NVarChar, SourceOfInfo || null);
        request.input('EnquiryDate', sql.VarChar(10), EnquiryDate ? EnquiryDate.split('T')[0] : null);
        request.input('DueDate', sql.VarChar(10), DueOn ? DueOn.split('T')[0] : null);
        request.input('SiteVisitDate', sql.VarChar(10), SiteVisitDate ? SiteVisitDate.split('T')[0] : null);

        request.input('CustomerName', sql.NVarChar, SelectedCustomers ? SelectedCustomers.join(',') : null);
        request.input('ReceivedFrom', sql.NVarChar, SelectedReceivedFroms ? SelectedReceivedFroms.map(i => i.split('|')[0]).join(',') : null);
        request.input('ProjectName', sql.NVarChar, ProjectName || null);
        request.input('ClientName', sql.NVarChar, ClientName || null);
        request.input('ConsultantName', sql.NVarChar, SelectedConsultants ? SelectedConsultants.join(',') : (ConsultantName || null));
        request.input('EnquiryDetails', sql.NVarChar, DetailsOfEnquiry || null);

        request.input('Doc_HardCopies', sql.Bit, hardcopy ?? false);
        request.input('Doc_Drawing', sql.Bit, drawing ?? false);
        request.input('Doc_CD_DVD', sql.Bit, dvd ?? false);
        request.input('Doc_Spec', sql.Bit, spec ?? false);
        request.input('Doc_EquipmentSchedule', sql.Bit, eqpschedule ?? false);
        request.input('Remarks', sql.NVarChar, Remark || null);
        request.input('SendAcknowledgementMail', sql.Bit, AutoAck ?? false);
        request.input('CustomerRefNo', sql.NVarChar, req.body.CustomerRefNo || null);
        request.input('ED_CEOSignatureRequired', sql.Bit, ceosign ?? false);
        request.input('Status', sql.NVarChar, Status || 'Open');
        request.input('AcknowledgementSE', sql.NVarChar, AcknowledgementSE || null);
        request.input('AdditionalNotificationEmails', sql.NVarChar, AdditionalNotificationEmails || null);
        request.input('OthersSpecify', sql.NVarChar, DocumentsReceived || null);
        request.input('CreatedBy', sql.NVarChar, req.body.CreatedBy || 'System');

        log(`DEBUG - AcknowledgementSE value: '${AcknowledgementSE}', Type: ${typeof AcknowledgementSE}`);
        log(`DEBUG - AdditionalNotificationEmails value: '${AdditionalNotificationEmails}', Type: ${typeof AdditionalNotificationEmails}`);

        const now = new Date();
        request.input('now', sql.DateTime, now);
        await request.query(`
            INSERT INTO EnquiryMaster (
                RequestNo, SourceOfEnquiry, EnquiryDate, DueDate, SiteVisitDate,
                CustomerName, ReceivedFrom, ProjectName, ClientName, ConsultantName,
                EnquiryDetails, Doc_HardCopies, Doc_Drawing, Doc_CD_DVD,
                Doc_Spec, Doc_EquipmentSchedule, Remarks, CustomerRefNo, SendAcknowledgementMail, ED_CEOSignatureRequired, Status, AcknowledgementSE, AdditionalNotificationEmails, OthersSpecify, CreatedBy, CreatedAt
            ) VALUES (
                @RequestNo, @SourceOfEnquiry, @EnquiryDate, @DueDate, @SiteVisitDate,
                @CustomerName, @ReceivedFrom, @ProjectName, @ClientName, @ConsultantName,
                @EnquiryDetails, @Doc_HardCopies, @Doc_Drawing, @Doc_CD_DVD,
                @Doc_Spec, @Doc_EquipmentSchedule, @Remarks, @CustomerRefNo, @SendAcknowledgementMail, @ED_CEOSignatureRequired, @Status, @AcknowledgementSE, @AdditionalNotificationEmails, @OthersSpecify, @CreatedBy, @now
            )
        `);

        // Helper to insert related items
        const insertRelated = async (table, col, items, txn) => {
            if (items && items.length > 0) {
                if (table === 'EnquiryFor') {
                    const normalized = items.map(i => {
                        if (typeof i === 'string') return { tempId: i, itemName: i, parentId: null };
                        return {
                            tempId: i.id || Math.random().toString(36),
                            itemName: i.itemName,
                            leadJobCode: i.leadJobCode,
                            leadJobName: i.leadJobName,
                            parentId: i.parentId,
                            parentName: i.parentName
                        };
                    });

                    const idMap = {};
                    let remaining = [...normalized];
                    let pass = 0;

                    while (remaining.length > 0 && pass < 10) {
                        const nextBatch = [];
                        for (const item of remaining) {
                            const ready = !item.parentId || idMap[item.parentId];
                            if (ready) {
                                const r = new sql.Request(txn);
                                r.input('reqNo', sql.NVarChar, RequestNo);

                                let code = item.leadJobCode || null;
                                let name = item.itemName;

                                if (!code) {
                                    const match = name.match(/^(L\d+)\s+-\s+(.*)$/);
                                    if (match) {
                                        code = match[1];
                                        name = match[2];
                                    }
                                }
                                if (!code || !String(code).trim().toUpperCase().match(/^L\d+$/)) {
                                    code = null;
                                } else {
                                    code = String(code).trim().toUpperCase();
                                }

                                const leadName = item.leadJobName || null;
                                r.input('code', sql.NVarChar, code);
                                r.input('lname', sql.NVarChar, leadName);
                                r.input('val', sql.NVarChar, name);
                                r.input('pId', sql.Int, item.parentId ? idMap[item.parentId] : null);

                                const res = await r.query(`INSERT INTO EnquiryFor (RequestNo, LeadJobCode, LeadJobName, ItemName, ParentID) VALUES (@reqNo, @code, @lname, @val, @pId); SELECT SCOPE_IDENTITY() AS id;`);
                                idMap[item.tempId] = res.recordset[0].id;
                            } else {
                                nextBatch.push(item);
                            }
                        }
                        if (nextBatch.length === remaining.length) {
                            for (const item of nextBatch) {
                                const r = new sql.Request(txn);
                                r.input('reqNo', sql.NVarChar, RequestNo);

                                let code = item.leadJobCode || null;
                                let name = item.itemName;

                                if (!code) {
                                    const match = name.match(/^(L\d+)\s+-\s+(.*)$/);
                                    if (match) {
                                        code = match[1];
                                        name = match[2];
                                    }
                                }
                                if (!code || !String(code).trim().toUpperCase().match(/^L\d+$/)) {
                                    code = null;
                                } else {
                                    code = String(code).trim().toUpperCase();
                                }

                                const leadName = item.leadJobName || null;
                                r.input('code', sql.NVarChar, code);
                                r.input('lname', sql.NVarChar, leadName);
                                r.input('val', sql.NVarChar, name);
                                r.input('pId', sql.Int, null);
                                const res = await r.query(`INSERT INTO EnquiryFor (RequestNo, LeadJobCode, LeadJobName, ItemName, ParentID) VALUES (@reqNo, @code, @lname, @val, @pId); SELECT SCOPE_IDENTITY() AS id;`);
                                idMap[item.tempId] = res.recordset[0].id;
                            }
                            break;
                        }
                        remaining = nextBatch;
                        pass++;
                    }
                } else {
                    if (table === 'ConcernedSE' && col === 'SEName') {
                        const concernedItems =
                            ConcernedSEAssignments && ConcernedSEAssignments.length > 0
                                ? ConcernedSEAssignments
                                : items;
                        await insertConcernedSERows(
                            sql,
                            txn,
                            RequestNo,
                            concernedItems,
                            SelectedEnquiryFor
                        );
                        return;
                    }
                    for (const item of items) {
                        const r = new sql.Request(txn);
                        r.input('reqNo', sql.NVarChar, RequestNo);
                        r.input('val', sql.NVarChar, item);
                        await r.query(`INSERT INTO ${table} (RequestNo, ${col}) VALUES (@reqNo, @val)`);
                    }
                }
            }
        };

        await insertRelated('EnquiryFor', 'ItemName', SelectedEnquiryFor, transaction);
        await normalizeEnquiryForLeadMeta(RequestNo, transaction);
        const insertReceivedFrom = async () => {
            if (!SelectedReceivedFroms || SelectedReceivedFroms.length === 0) return;
            for (const item of SelectedReceivedFroms) {
                const [contact, company] = item.split('|');
                const r = new sql.Request(transaction);
                r.input('reqNo', sql.NVarChar, RequestNo);
                r.input('contact', sql.NVarChar, contact);
                r.input('company', sql.NVarChar, company);
                await r.query(`INSERT INTO ReceivedFrom (RequestNo, ContactName, CompanyName) VALUES (@reqNo, @contact, @company)`);
            }
        };
        await insertRelated('EnquiryCustomer', 'CustomerName', SelectedCustomers, transaction);
        await insertRelated('EnquiryType', 'TypeName', SelectedEnquiryTypes, transaction);
        await insertRelated(
            'ConcernedSE',
            'SEName',
            ConcernedSEAssignments && ConcernedSEAssignments.length > 0
                ? ConcernedSEAssignments
                : SelectedConcernedSEs,
            transaction
        );
        await insertRelated('EnquiryConsultant', 'ConsultantName', SelectedConsultants, transaction);
        await insertReceivedFrom();



        // --- Update Master Tables with RequestNo ---
        try {
            // 1. Source Of Enquiry
            if (SourceOfInfo) {
                await new sql.Request(transaction).query`UPDATE Master_SourceOfEnquiry SET RequestNo = ${RequestNo} WHERE SourceName = ${SourceOfInfo}`;
            }

            // 2. Enquiry Type
            if (SelectedEnquiryTypes && SelectedEnquiryTypes.length > 0) {
                for (const type of SelectedEnquiryTypes) {
                    await new sql.Request(transaction).query`UPDATE Master_EnquiryType SET RequestNo = ${RequestNo} WHERE TypeName = ${type}`;
                }
            }

            // 3. Enquiry For
            if (SelectedEnquiryFor && SelectedEnquiryFor.length > 0) {
                for (const item of SelectedEnquiryFor) {
                    const name = typeof item === 'object' ? item.itemName : item;
                    await new sql.Request(transaction).query`UPDATE Master_EnquiryFor SET RequestNo = ${RequestNo} WHERE ItemName = ${name}`;
                }
            }

            // 4. Received From
            if (SelectedReceivedFroms && SelectedReceivedFroms.length > 0) {
                for (const item of SelectedReceivedFroms) {
                    const [contact, company] = item.split('|');
                    await new sql.Request(transaction).query`UPDATE Master_ReceivedFrom SET RequestNo = ${RequestNo} WHERE ContactName = ${contact} AND CompanyName = ${company}`;
                }
            }

            // 5. Concerned SE
            if (SelectedConcernedSEs && SelectedConcernedSEs.length > 0) {
                for (const se of SelectedConcernedSEs) {
                    await new sql.Request(transaction).query`UPDATE Master_ConcernedSE SET RequestNo = ${RequestNo} WHERE FullName = ${se}`;
                }
            }

            // 6. Customer Name
            if (SelectedCustomers && SelectedCustomers.length > 0) {
                console.log('Updating Master_CustomerName for:', SelectedCustomers);
                for (const cust of SelectedCustomers) {
                    const result = await new sql.Request(transaction).query`UPDATE Master_CustomerName SET RequestNo = ${RequestNo} WHERE CompanyName = ${cust}`;
                    console.log(`Updated Master_CustomerName for ${cust}. Rows affected: ${result.rowsAffected}`);
                }
            } else {
                console.log('No SelectedCustomers to update in Master_CustomerName');
            }

            // 7. Client Name
            if (ClientName) {
                console.log('Updating Master_ClientName for:', ClientName);
                await new sql.Request(transaction).query`UPDATE Master_ClientName SET RequestNo = ${RequestNo} WHERE CompanyName = ${ClientName}`;
            }

            // 8. Consultant Name
            if (ConsultantName) {
                console.log('Updating Master_ConsultantName for:', ConsultantName);
                await new sql.Request(transaction).query`UPDATE Master_ConsultantName SET RequestNo = ${RequestNo} WHERE CompanyName = ${ConsultantName}`;
            }

        } catch (updateErr) {
            console.error('Error updating Master tables with RequestNo:', updateErr);
            throw updateErr; // Re-throw to trigger rollback
        }

        await transaction.commit();

        // Post-commit tasks (emails + notifications) should not block API response.
        setImmediate(async () => {
            // Enquiry notification is opened as a local Outlook draft from the client (VBScript), not sent via SMTP.
            try {
                const currentUserEmailRes = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE FullName = ${req.body.CreatedBy}`;
                const currentUserEmail = currentUserEmailRes.recordset.length > 0 ? currentUserEmailRes.recordset[0].EmailId : null;
                queueCreateNotifications(
                    RequestNo,
                    'New Enquiry',
                    `New Enquiry created ${RequestNo} for ${req.body.ProjectName || req.body.projectName || '-'} by ${req.body.CreatedBy}`,
                    currentUserEmail,
                    req.body.CreatedBy
                );
            } catch (notifErr) {
                console.error('Failed async post-create notifications:', notifErr);
            }
        });

        res.status(201).json({ message: 'Enquiry created', RequestNo });
    } catch (err) {
        if (transaction) {
            try { await transaction.rollback(); } catch (rbErr) { console.error('Rollback error:', rbErr); }
        }

        const logFile = path.join(__dirname, 'debug.log');
        fs.appendFileSync(logFile, `${new Date().toISOString()} - ERROR: ${err.message}\n${err.stack}\n`);
        console.error(err);

        if (err.number === 2627) { // PK Violation
            return res.status(409).json({
                message: 'Duplicate Enquiry Number',
                error: 'Enquiry number conflict — please submit again; a new number will be assigned automatically.',
            });
        }
        res.status(500).json({ message: err.message || 'Server Error' });
    }
});

// Update Enquiry
// Update Enquiry
// Get Single Enquiry
app.get('/api/enquiries/:id', async (req, res) => {
    try {
        const reqNo = req.params.id;
        console.log(`[GET /api/enquiries/${reqNo}] Fetching single enquiry...`);

        // Enquiry visibility (same policy as list/dashboard):
        // - Admin/System: allow
        // - Default: assigned enquiries only (ConcernedSE)
        // - CC users: department enquiries (CC mail) + assigned
        const userEmail = req.query.userEmail || '';
        const userName = req.query.userName || '';
        const userRole = req.query.userRole || '';
        const vis = await resolveEnquiryVisibilityContext({ userEmail, userName, userRole });

        const result = await sql.query`SELECT * FROM EnquiryMaster WHERE RequestNo = ${reqNo}`;
        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }
        const enq = result.recordset[0];

        // Fetch related data
        const customersResult = await sql.query`SELECT * FROM EnquiryCustomer WHERE RequestNo = ${reqNo}`;
        const contactsResult = await sql.query`SELECT * FROM ReceivedFrom WHERE RequestNo = ${reqNo}`;
        const typesResult = await sql.query`SELECT * FROM EnquiryType WHERE RequestNo = ${reqNo}`;
        const itemsResult = await sql.query`SELECT * FROM EnquiryFor WHERE RequestNo = ${reqNo}`;
        const seResult = await sql.query`SELECT * FROM ConcernedSE WHERE RequestNo = ${reqNo}`;
        const consultantsResult = await sql.query`SELECT * FROM EnquiryConsultant WHERE RequestNo = ${reqNo}`;
        const masterEnqForRes = (!vis.isAdmin && vis.email && vis.accessMode === 'department')
            ? await sql.query`SELECT ItemName, CCMailIds FROM Master_EnquiryFor`
            : { recordset: [] };

        if (!vis.isAdmin && vis.email) {
            const normEmail = normalizeEmail(vis.email);
            const assignedRes = await sql.query`
                SELECT TOP 1 1 AS ok
                FROM ConcernedSE cs
                INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) = ${normEmail}
                  AND LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) = LTRIM(RTRIM(${reqNo}))
            `;
            const assigned = (assignedRes.recordset?.length || 0) > 0;

            let deptAllowed = false;
            if (vis.accessMode === 'department') {
                const emailLower = normEmail;
                const masterRows = (masterEnqForRes.recordset || []).map(r => ({
                    itemKey: stripJobPrefix(r.ItemName).toLowerCase(),
                    ccMails: splitMailList(r.CCMailIds).map(m => normalizeEmail(m))
                }));
                const masterByKey = new Map();
                masterRows.forEach(r => {
                    if (!r.itemKey) return;
                    const list = masterByKey.get(r.itemKey) || [];
                    list.push(r);
                    masterByKey.set(r.itemKey, list);
                });
                deptAllowed = (itemsResult.recordset || []).some(ef => {
                    const efKey = stripJobPrefix(ef.ItemName).toLowerCase();
                    const candidates = masterByKey.get(efKey) || [];
                    return candidates.some(c => c.ccMails.includes(emailLower));
                });
            }

            let allow = assigned || deptAllowed;
            if (allow && vis.accessMode === 'assigned' && assigned) {
                const ctx = await resolvePricingAccessContext(normEmail);
                if (ctx.user && !ctx.isCcUser) {
                    const jobRows = (itemsResult.recordset || []).map(i => ({
                        ID: i.ID,
                        ParentID: i.ParentID,
                        ItemName: i.ItemName,
                    }));
                    allow = getPricingAnchorJobs(jobRows, ctx, normEmail).length > 0;
                }
            }

            if (!allow) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        const relatedCustomers = customersResult.recordset.map(c => c.CustomerName);
        const relatedContacts = contactsResult.recordset.map(c => `${c.ContactName}|${c.CompanyName || ''}`);
        const relatedTypes = typesResult.recordset.map(t => t.TypeName);

        const relatedItemsRaw = itemsResult.recordset;
        const relatedItemsStructured = relatedItemsRaw.map(i => ({
            id: i.ID,
            parentId: i.ParentID,
            itemName: i.ItemName,
            leadJobCode: i.LeadJobCode,
            parentName: i.ParentItemName
        }));
        const relatedItemsDisplay = relatedItemsRaw.map(i => i.ItemName);

        const relatedSEs = seResult.recordset.map(s => s.SEName);
        const concernedSEAssignments = mapConcernedSEAssignmentsFromRows(seResult.recordset);

        const fullEnquiry = {
            ...enq,
            SelectedEnquiryTypes: relatedTypes,
            SelectedEnquiryFor: relatedItemsStructured,
            SelectedCustomers: relatedCustomers,
            SelectedReceivedFroms: relatedContacts,
            SelectedConcernedSEs: relatedSEs,
            ConcernedSEAssignments: concernedSEAssignments,
            SelectedConsultants: consultantsResult.recordset.map(c => c.ConsultantName),
            EnquiryType: relatedTypes.join(', '),
            EnquiryFor: relatedItemsDisplay.join(', '),
            CustomerName: enq.CustomerName || relatedCustomers.join(', '),
            ClientName: enq.ClientName,
            ConsultantName: enq.ConsultantName,
            ReceivedFrom: relatedContacts.map(c => c.split('|')[0]).join(', '),
            ConcernedSE: relatedSEs.join(', '),
            SourceOfInfo: enq.SourceOfEnquiry,
            DueOn: enq.DueDate
        };

        res.json(fullEnquiry);
    } catch (err) {
        console.error('Error fetching single enquiry:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * Activity-based workflow (pricing / quote per EnquiryFor branch + enquiry-level probability for follow-up/won).
 */
app.get('/api/enquiries/:id/milestone-status', async (req, res) => {
    try {
        const reqNo = req.params.id;
        const userEmail = req.query.userEmail || '';
        const userName = req.query.userName || '';
        const userRole = req.query.userRole || '';
        const vis = await resolveEnquiryVisibilityContext({ userEmail, userName, userRole });

        const masterRes = await sql.query`
            SELECT RequestNo, Status, WonQuoteRef
            FROM EnquiryMaster
            WHERE RequestNo = ${reqNo}
        `;
        if (masterRes.recordset.length === 0) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }
        const masterRow = masterRes.recordset[0];

        const itemsResult = await sql.query`SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = ${reqNo}`;
        const masterEnqForRes =
            !vis.isAdmin && vis.email && vis.accessMode === 'department'
                ? await sql.query`SELECT ItemName, CCMailIds FROM Master_EnquiryFor`
                : { recordset: [] };

        if (!vis.isAdmin && vis.email) {
            const normEmail = normalizeEmail(vis.email);
            const assignedRes = await sql.query`
                SELECT TOP 1 1 AS ok
                FROM ConcernedSE cs
                INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) = ${normEmail}
                  AND LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) = LTRIM(RTRIM(${reqNo}))
            `;
            const assigned = (assignedRes.recordset?.length || 0) > 0;

            let deptAllowed = false;
            if (vis.accessMode === 'department') {
                const emailLower = normEmail;
                const masterRows = (masterEnqForRes.recordset || []).map((r) => ({
                    itemKey: stripJobPrefix(r.ItemName).toLowerCase(),
                    ccMails: splitMailList(r.CCMailIds).map((m) => normalizeEmail(m)),
                }));
                const masterByKey = new Map();
                masterRows.forEach((r) => {
                    if (!r.itemKey) return;
                    const list = masterByKey.get(r.itemKey) || [];
                    list.push(r);
                    masterByKey.set(r.itemKey, list);
                });
                deptAllowed = (itemsResult.recordset || []).some((ef) => {
                    const efKey = stripJobPrefix(ef.ItemName).toLowerCase();
                    const candidates = masterByKey.get(efKey) || [];
                    return candidates.some((c) => c.ccMails.includes(emailLower));
                });
            }

            let allow = assigned || deptAllowed;
            if (allow && vis.accessMode === 'assigned' && assigned) {
                const ctx = await resolvePricingAccessContext(normEmail);
                if (ctx.user && !ctx.isCcUser) {
                    const jobRows = (itemsResult.recordset || []).map((i) => ({
                        ID: i.ID,
                        ParentID: i.ParentID,
                        ItemName: i.ItemName,
                    }));
                    allow = getPricingAnchorJobs(jobRows, ctx, normEmail).length > 0;
                }
            }

            if (!allow) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        const branches = (itemsResult.recordset || []).map((i) => ({
            id: i.ID,
            parentId: i.ParentID,
            itemName: i.ItemName,
        }));

        const valuesRes = await sql.query`
            SELECT v.EnquiryForID, v.EnquiryForItem, v.Price, po.OptionName
            FROM dbo.EnquiryPricingValues v
            INNER JOIN dbo.EnquiryPricingOptions po ON po.ID = v.OptionID
            WHERE LTRIM(RTRIM(v.RequestNo)) = LTRIM(RTRIM(${reqNo}))
        `;

        const quotesRes = await sql.query`
            SELECT OwnJob, LeadJob, Status, QuoteNumber
            FROM dbo.EnquiryQuotes
            WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${reqNo}))
        `;

        const computed = computeEnquiryWorkflowStatus({
            branches,
            valueRows: valuesRes.recordset || [],
            quoteRows: quotesRes.recordset || [],
            masterRow: masterRow,
        });

        res.json(computed);
    } catch (err) {
        console.error('Error milestone-status:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

/**
 * EnquiryFor pricing guard: which EnquiryFor IDs have any pricing rows?
 * Also returns customer names that have an updated (non-zero) price — used to block
 * removing those customers from the enquiry even by the creator.
 */
app.get('/api/enquiries/:id/enquiryfor/priced-ids', async (req, res) => {
    const reqNo = String(req.params.id || '').trim();
    if (!reqNo) return res.status(400).json({ error: 'Missing RequestNo' });
    try {
        const r = await sql.query`
            SELECT EnquiryForID, COUNT(1) AS Cnt
            FROM EnquiryPricingValues
            WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${reqNo}))
              AND EnquiryForID IS NOT NULL
              AND EnquiryForID <> 0
            GROUP BY EnquiryForID
        `;
        const rows = r.recordset || [];
        const pricedById = {};
        rows.forEach((x) => {
            const id = x.EnquiryForID;
            const cnt = x.Cnt;
            if (id == null) return;
            pricedById[String(id)] = Number(cnt) || 0;
        });

        const custRes = await sql.query`
            SELECT DISTINCT LTRIM(RTRIM(ISNULL(CustomerName, N''))) AS CustomerName
            FROM EnquiryPricingValues
            WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${reqNo}))
              AND LTRIM(RTRIM(ISNULL(CustomerName, N''))) <> N''
              AND ISNULL(
                    TRY_CONVERT(
                        DECIMAL(18,2),
                        REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(CAST(Price AS NVARCHAR(50)), N'0'))), N',', N''), N'BD', N''), N' ', N'')
                    ),
                    0
                ) > 0
        `;
        const pricedCustomers = (custRes.recordset || [])
            .map((x) => String(x.CustomerName || '').trim())
            .filter(Boolean);

        res.json({
            requestNo: reqNo,
            pricedIds: Object.keys(pricedById).map((k) => Number(k)).filter((n) => Number.isFinite(n)),
            pricedById,
            pricedCustomers,
        });
    } catch (err) {
        console.error('Error priced-ids:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Update Enquiry
app.put('/api/enquiries/:id', async (req, res) => {
    const id = req.params.id.trim();
    const {
        SourceOfInfo, EnquiryDate, DueOn, SiteVisitDate,
        SelectedEnquiryTypes, SelectedEnquiryFor,
        SelectedCustomers, SelectedReceivedFroms, SelectedConcernedSEs, ConcernedSEAssignments,
        ProjectName, ClientName, ConsultantName, SelectedConsultants, DetailsOfEnquiry,
        DocumentsReceived, hardcopy, drawing, dvd, spec, eqpschedule, Remark,
        AutoAck, ceosign, Status, AcknowledgementSE, AdditionalNotificationEmails, CustomerRefNo
    } = req.body;

    try {
        const pnTrim = (ProjectName || '').trim();
        if (pnTrim) {
            const dupProj = await sql.query`
                SELECT TOP 1 RequestNo FROM EnquiryMaster
                WHERE LTRIM(RTRIM(LOWER(ProjectName))) = ${pnTrim.toLowerCase()}
                AND RequestNo <> ${id}
            `;
            if (dupProj.recordset.length > 0) {
                return res.status(400).json({
                    message: 'Duplicate Project Name',
                    error: 'already Project name is exist',
                });
            }
        }

        // Customers with an updated price in Pricing cannot be removed from the enquiry
        // (even by the creator). Restore any priced names missing from the payload.
        let customersToSave = Array.isArray(SelectedCustomers) ? [...SelectedCustomers] : [];
        try {
            const pricedCustRes = await sql.query`
                SELECT DISTINCT LTRIM(RTRIM(ISNULL(CustomerName, N''))) AS CustomerName
                FROM EnquiryPricingValues
                WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${id}))
                  AND LTRIM(RTRIM(ISNULL(CustomerName, N''))) <> N''
                  AND ISNULL(
                        TRY_CONVERT(
                            DECIMAL(18,2),
                            REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(CAST(Price AS NVARCHAR(50)), N'0'))), N',', N''), N'BD', N''), N' ', N'')
                        ),
                        0
                    ) > 0
            `;
            const existingCustRes = await sql.query`
                SELECT CustomerName FROM EnquiryCustomer
                WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${id}))
            `;
            const pricedNames = (pricedCustRes.recordset || [])
                .map((r) => String(r.CustomerName || '').trim())
                .filter(Boolean);
            const existingNames = (existingCustRes.recordset || [])
                .map((r) => String(r.CustomerName || '').trim())
                .filter(Boolean);
            const norm = (s) => String(s || '').trim().toLowerCase();
            const saveKeys = new Set(customersToSave.map(norm).filter(Boolean));
            const restored = [];
            for (const existing of existingNames) {
                const isPriced = pricedNames.some((p) => norm(p) === norm(existing));
                if (!isPriced) continue;
                if (saveKeys.has(norm(existing))) continue;
                customersToSave.push(existing);
                saveKeys.add(norm(existing));
                restored.push(existing);
            }
            if (restored.length) {
                console.warn(
                    `[PUT /api/enquiries/${id}] Restored priced customer(s) that cannot be removed:`,
                    restored.join(', ')
                );
            }
        } catch (custGuardErr) {
            console.warn('[PUT /api/enquiries] priced-customer guard:', custGuardErr.message);
        }

        const request = new sql.Request();
        request.input('RequestNo', sql.NVarChar, id);
        request.input('SourceOfEnquiry', sql.NVarChar, SourceOfInfo);
        request.input('EnquiryDate', sql.VarChar(10), EnquiryDate ? EnquiryDate.split('T')[0] : null);
        request.input('DueDate', sql.VarChar(10), DueOn ? DueOn.split('T')[0] : null);
        request.input('SiteVisitDate', sql.VarChar(10), SiteVisitDate ? SiteVisitDate.split('T')[0] : null);
        request.input('CustomerName', sql.NVarChar, customersToSave.length ? customersToSave.join(',') : null);
        request.input('ReceivedFrom', sql.NVarChar, SelectedReceivedFroms ? SelectedReceivedFroms.map(i => i.split('|')[0]).join(',') : null);

        request.input('ProjectName', sql.NVarChar, ProjectName);
        request.input('ClientName', sql.NVarChar, ClientName);
        request.input('ConsultantName', sql.NVarChar, SelectedConsultants ? SelectedConsultants.join(',') : (ConsultantName || null));
        request.input('EnquiryDetails', sql.NVarChar, DetailsOfEnquiry);
        // DocumentsReceived is not in new schema as a single field, it's checkboxes
        request.input('Doc_HardCopies', sql.Bit, hardcopy);
        request.input('Doc_Drawing', sql.Bit, drawing);
        request.input('Doc_CD_DVD', sql.Bit, dvd);
        request.input('Doc_Spec', sql.Bit, spec);
        request.input('Doc_EquipmentSchedule', sql.Bit, eqpschedule);
        request.input('Remarks', sql.NVarChar, Remark);
        request.input('SendAcknowledgementMail', sql.Bit, AutoAck);
        request.input('ED_CEOSignatureRequired', sql.Bit, ceosign);
        request.input('Status', sql.NVarChar, Status);
        request.input('AcknowledgementSE', sql.NVarChar, AcknowledgementSE);
        request.input('AdditionalNotificationEmails', sql.NVarChar, AdditionalNotificationEmails);
        request.input('CustomerRefNo', sql.NVarChar, CustomerRefNo || null);
        request.input('OthersSpecify', sql.NVarChar, DocumentsReceived);

        const updateResult = await request.query(`
            UPDATE EnquiryMaster SET
                SourceOfEnquiry=@SourceOfEnquiry, EnquiryDate=@EnquiryDate, DueDate=@DueDate, SiteVisitDate=@SiteVisitDate,
                CustomerName=@CustomerName, ReceivedFrom=@ReceivedFrom, ProjectName=@ProjectName, ClientName=@ClientName, ConsultantName=@ConsultantName,
                EnquiryDetails=@EnquiryDetails, Doc_HardCopies=@Doc_HardCopies, Doc_Drawing=@Doc_Drawing, Doc_CD_DVD=@Doc_CD_DVD,
                Doc_Spec=@Doc_Spec, Doc_EquipmentSchedule=@Doc_EquipmentSchedule, Remarks=@Remarks, CustomerRefNo=@CustomerRefNo, SendAcknowledgementMail=@SendAcknowledgementMail, ED_CEOSignatureRequired=@ED_CEOSignatureRequired, Status=@Status, AcknowledgementSE=@AcknowledgementSE, AdditionalNotificationEmails=@AdditionalNotificationEmails, OthersSpecify=@OthersSpecify
            WHERE RequestNo=@RequestNo
        `);

        if (updateResult.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Enquiry not found', error: `Enquiry with Number ${id} does not exist.` });
        }

        /**
         * Update EnquiryFor structure WITHOUT rebuilding (no DELETE+INSERT).
         * Preserves EnquiryFor.ID so EnquiryPricingValues.EnquiryForID stays valid.
         *
         * Incoming items are an array of objects from HierarchyBuilder:
         * { id, itemName, parentId, leadJobCode?, leadJobName?, parentName? }
         * - Existing DB rows: id is numeric
         * - New rows: id is a temp string; parentId may reference another temp id (insert in same request)
         *
         * Behavior:
         * - Insert new rows.
         * - Update existing rows in-place.
         * - Delete rows missing from payload ONLY if they have no pricing values (and no priced descendants, since descendants are missing too).
         */
        const updateEnquiryForStructureUpsert = async (requestNo, items) => {
            const reqNo = String(requestNo || '').trim();
            const payload = Array.isArray(items) ? items : [];

            const parseLeadCodeAndName = (rawItem) => {
                let name = rawItem?.itemName ?? rawItem;
                name = String(name || '').trim();
                let code = rawItem?.leadJobCode ?? null;
                if (!code) {
                    const match = name.match(/^(L\d+)\s+-\s+(.*)$/);
                    if (match) {
                        code = match[1];
                        name = match[2];
                    }
                }
                if (!code || !String(code).trim().toUpperCase().match(/^L\d+$/)) {
                    code = null;
                } else {
                    code = String(code).trim().toUpperCase();
                }
                const leadName = rawItem?.leadJobName != null ? String(rawItem.leadJobName).trim() : null;
                return { code, name, leadName };
            };

            const isNumericId = (v) => {
                if (v == null || v === '') return false;
                const n = Number(v);
                return Number.isFinite(n) && String(v).trim() === String(n);
            };

            // 1) Fetch existing rows
            const existingRes = await new sql.Request().query`
                SELECT ID, ParentID, ItemName, LeadJobCode, LeadJobName
                FROM EnquiryFor
                WHERE RequestNo = ${reqNo}
            `;
            const existingRows = existingRes.recordset || [];
            const existingById = new Map(
                existingRows
                    .filter((r) => Number.isFinite(Number(r.ID)))
                    .map((r) => [Number(r.ID), r])
            );
            const existingIds = new Set(existingRows.map((r) => Number(r.ID)).filter((n) => Number.isFinite(n)));

            // 2) Normalize payload items
            const normalized = payload
                .map((i, idx) => {
                    if (typeof i === 'string') {
                        const { code, name, leadName } = parseLeadCodeAndName({ itemName: i });
                        return {
                            tempId: `legacy-${idx}-${name.slice(0, 20)}`,
                            id: null,
                            itemName: name,
                            leadJobCode: code,
                            leadJobName: leadName,
                            parentId: null,
                        };
                    }
                    const { code, name, leadName } = parseLeadCodeAndName(i);
                    return {
                        tempId: String(i?.id ?? `tmp-${idx}-${Math.random().toString(36).slice(2)}`),
                        id: isNumericId(i?.id) ? Number(i.id) : null,
                        itemName: name,
                        leadJobCode: code,
                        leadJobName: leadName,
                        parentId: i?.parentId ?? null,
                    };
                })
                .filter((i) => i.itemName && String(i.itemName).trim());

            const incomingExistingIds = new Set(normalized.filter((i) => i.id != null).map((i) => i.id));

            // 3) Determine deletions: existing IDs missing from payload
            const removedIds = [...existingIds].filter((eid) => !incomingExistingIds.has(eid));

            // Guard: never allow deleting priced rows (or their priced descendants which are also removed)
            if (removedIds.length > 0) {
                const r = new sql.Request();
                r.input('reqNo', sql.NVarChar, reqNo);
                const params = removedIds.map((_, ix) => `@rid${ix}`);
                removedIds.forEach((val, ix) => r.input(`rid${ix}`, sql.Int, val));
                const priced = await r.query(
                    `SELECT TOP 20 EnquiryForID, EnquiryForItem, LeadJobName, CustomerName, PriceOption
                     FROM EnquiryPricingValues
                     WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(@reqNo))
                       AND EnquiryForID IN (${params.join(', ')})`
                );
                if ((priced.recordset || []).length > 0) {
                    const hits = priced.recordset.slice(0, 10).map((p) => ({
                        enquiryForId: p.EnquiryForID,
                        item: p.EnquiryForItem,
                        lead: p.LeadJobName,
                        customer: p.CustomerName,
                        option: p.PriceOption,
                    }));
                    const err = new Error('Cannot delete priced job(s). Delete the prices first.');
                    err.statusCode = 409;
                    err.payload = {
                        error: 'JOB_PRICED_CANNOT_DELETE',
                        message: 'One or more selected jobs already have pricing. Delete prices first, then delete the job.',
                        pricedExamples: hits,
                    };
                    throw err;
                }
            }

            // 4) Apply deletes
            if (removedIds.length > 0) {
                const delReq = new sql.Request();
                delReq.input('reqNo', sql.NVarChar, reqNo);
                const params = removedIds.map((_, ix) => `@did${ix}`);
                removedIds.forEach((val, ix) => delReq.input(`did${ix}`, sql.Int, val));
                await delReq.query(
                    `DELETE FROM EnquiryFor WHERE RequestNo = @reqNo AND ID IN (${params.join(', ')})`
                );
            }

            // 5) Insert new rows in parent-first order
            const idMap = {};
            normalized.forEach((i) => {
                if (i.id != null) idMap[String(i.tempId)] = i.id;
            });

            const remaining = normalized.filter((i) => i.id == null);
            let pass = 0;
            while (remaining.length > 0 && pass < 20) {
                const nextBatch = [];
                let insertedThisPass = 0;

                for (const item of remaining) {
                    const parentRaw = item.parentId;
                    let parentResolved = null;
                    if (parentRaw == null || parentRaw === '' || parentRaw === 0 || parentRaw === '0') {
                        parentResolved = null;
                    } else if (isNumericId(parentRaw)) {
                        parentResolved = Number(parentRaw);
                    } else if (idMap[String(parentRaw)]) {
                        parentResolved = Number(idMap[String(parentRaw)]);
                    } else {
                        // parent not inserted yet
                        nextBatch.push(item);
                        continue;
                    }

                    const r = new sql.Request();
                    r.input('reqNo', sql.NVarChar, reqNo);
                    r.input('code', sql.NVarChar, item.leadJobCode || null);
                    r.input('lname', sql.NVarChar, item.leadJobName || null);
                    r.input('val', sql.NVarChar, item.itemName);
                    r.input('pId', sql.Int, parentResolved);
                    const ins = await r.query(
                        `INSERT INTO EnquiryFor (RequestNo, LeadJobCode, LeadJobName, ItemName, ParentID)
                         VALUES (@reqNo, @code, @lname, @val, @pId);
                         SELECT SCOPE_IDENTITY() AS id;`
                    );
                    const newId = ins.recordset?.[0]?.id;
                    idMap[String(item.tempId)] = newId;
                    item.id = Number(newId);
                    insertedThisPass += 1;
                }

                if (insertedThisPass === 0 && nextBatch.length === remaining.length) {
                    break;
                }
                remaining.length = 0;
                nextBatch.forEach((x) => remaining.push(x));
                pass += 1;
            }

            // 6) Update only existing rows that actually changed.
            // Newly inserted rows already have final values from step 5, so skip redundant UPDATEs.
            for (const item of normalized) {
                if (item.id == null) continue;
                const finalId = Number(item.id);
                if (!Number.isFinite(finalId)) continue;
                const prev = existingById.get(finalId);
                if (!prev) continue;

                const parentRaw = item.parentId;
                let parentResolved = null;
                if (parentRaw == null || parentRaw === '' || parentRaw === 0 || parentRaw === '0') {
                    parentResolved = null;
                } else if (isNumericId(parentRaw)) {
                    parentResolved = Number(parentRaw);
                } else if (idMap[String(parentRaw)]) {
                    parentResolved = Number(idMap[String(parentRaw)]);
                }

                const nextCode = item.leadJobCode || null;
                const nextLeadName = item.leadJobName || null;
                const nextItemName = item.itemName;
                const prevParent = prev.ParentID == null ? null : Number(prev.ParentID);
                const hasChange =
                    String(prev.ItemName || '') !== String(nextItemName || '') ||
                    String(prev.LeadJobCode || '') !== String(nextCode || '') ||
                    String(prev.LeadJobName || '') !== String(nextLeadName || '') ||
                    (Number.isFinite(prevParent) ? prevParent : null) !== parentResolved;

                if (!hasChange) continue;

                const u = new sql.Request();
                u.input('reqNo', sql.NVarChar, reqNo);
                u.input('id', sql.Int, finalId);
                u.input('code', sql.NVarChar, nextCode);
                u.input('lname', sql.NVarChar, nextLeadName);
                u.input('val', sql.NVarChar, nextItemName);
                u.input('pId', sql.Int, parentResolved);
                await u.query(
                    `UPDATE EnquiryFor
                     SET LeadJobCode = @code,
                         LeadJobName = @lname,
                         ItemName = @val,
                         ParentID = @pId
                     WHERE RequestNo = @reqNo AND ID = @id`
                );
            }
        };

        // Helper to update related items (Delete + Insert)
        const updateRelated = async (table, col, items) => {
            if (table === 'EnquiryFor') {
                await updateEnquiryForStructureUpsert(id, items);
                return;
            }

            if (table === 'ConcernedSE' && col === 'SEName') {
                const concernedItems =
                    ConcernedSEAssignments && ConcernedSEAssignments.length > 0
                        ? ConcernedSEAssignments
                        : items;
                await replaceConcernedSERows(
                    sql,
                    null,
                    id,
                    concernedItems,
                    SelectedEnquiryFor
                );
                return;
            }

            const delReq = new sql.Request();
            delReq.input('reqNo', sql.NVarChar, id);
            await delReq.query(`DELETE FROM ${table} WHERE RequestNo = @reqNo`);

            if (items && items.length > 0) {
                if (table === 'EnquiryFor') {
                    const normalized = items.map(i => {
                        if (typeof i === 'string') return { tempId: i, itemName: i, parentId: null };
                        return {
                            tempId: i.id || Math.random().toString(36),
                            itemName: i.itemName,
                            leadJobCode: i.leadJobCode,
                            leadJobName: i.leadJobName,
                            parentId: i.parentId,
                            parentName: i.parentName
                        };
                    });

                    const idMap = {};
                    let remaining = [...normalized];
                    let pass = 0;

                    while (remaining.length > 0 && pass < 10) {
                        const nextBatch = [];
                        for (const item of remaining) {
                            const ready = !item.parentId || idMap[item.parentId];
                            if (ready) {
                                const r = new sql.Request();
                                r.input('reqNo', sql.NVarChar, id);

                                let code = item.leadJobCode || null;
                                let name = item.itemName;

                                if (!code) {
                                    const match = name.match(/^(L\d+)\s+-\s+(.*)$/);
                                    if (match) {
                                        code = match[1];
                                        name = match[2];
                                    }
                                }
                                if (!code || !String(code).trim().toUpperCase().match(/^L\d+$/)) {
                                    code = null;
                                } else {
                                    code = String(code).trim().toUpperCase();
                                }

                                const leadName = item.leadJobName || null;
                                r.input('code', sql.NVarChar, code);
                                r.input('lname', sql.NVarChar, leadName);
                                r.input('val', sql.NVarChar, name);
                                r.input('pName', sql.NVarChar, item.parentName || null);
                                r.input('pId', sql.Int, item.parentId ? idMap[item.parentId] : null);

                                const res = await r.query(`INSERT INTO EnquiryFor (RequestNo, LeadJobCode, LeadJobName, ItemName, ParentID) VALUES (@reqNo, @code, @lname, @val, @pId); SELECT SCOPE_IDENTITY() AS id;`);
                                idMap[item.tempId] = res.recordset[0].id;
                            } else {
                                nextBatch.push(item);
                            }
                        }
                        if (nextBatch.length === remaining.length) {
                            for (const item of nextBatch) {
                                const r = new sql.Request();
                                r.input('reqNo', sql.NVarChar, id);

                                let code = item.leadJobCode || null;
                                let name = item.itemName;

                                if (!code) {
                                    const match = name.match(/^(L\d+)\s+-\s+(.*)$/);
                                    if (match) {
                                        code = match[1];
                                        name = match[2];
                                    }
                                }
                                if (!code || !String(code).trim().toUpperCase().match(/^L\d+$/)) {
                                    code = null;
                                } else {
                                    code = String(code).trim().toUpperCase();
                                }

                                const leadName = item.leadJobName || null;
                                r.input('code', sql.NVarChar, code);
                                r.input('lname', sql.NVarChar, leadName);
                                r.input('val', sql.NVarChar, name);
                                r.input('pName', sql.NVarChar, item.parentName || null);
                                r.input('pId', sql.Int, null);
                                const res = await r.query(`INSERT INTO EnquiryFor (RequestNo, LeadJobCode, LeadJobName, ItemName, ParentID) VALUES (@reqNo, @code, @lname, @val, @pId); SELECT SCOPE_IDENTITY() AS id;`);
                                idMap[item.tempId] = res.recordset[0].id;
                            }
                            break;
                        }
                        remaining = nextBatch;
                        pass++;
                    }
                } else {
                    if (table === 'ConcernedSE' && col === 'SEName') {
                        const concernedItems =
                            ConcernedSEAssignments && ConcernedSEAssignments.length > 0
                                ? ConcernedSEAssignments
                                : items;
                        await insertConcernedSERows(
                            sql,
                            null,
                            id,
                            concernedItems,
                            SelectedEnquiryFor
                        );
                        return;
                    }
                    for (const item of items) {
                        const req = new sql.Request();
                        req.input('RequestNo', sql.NVarChar, id);
                        req.input('ItemValue', sql.NVarChar, item);
                        await req.query(`INSERT INTO ${table} (RequestNo, ${col}) VALUES (@RequestNo, @ItemValue)`);
                    }
                }
            }
        };

        await updateRelated('EnquiryFor', 'ItemName', SelectedEnquiryFor);
        await normalizeEnquiryForLeadMeta(id);

        const updateReceivedFrom = async () => {
            const delRF = new sql.Request();
            delRF.input('reqNo', sql.NVarChar, id);
            await delRF.query(`DELETE FROM ReceivedFrom WHERE RequestNo = @reqNo`);
            if (SelectedReceivedFroms && SelectedReceivedFroms.length > 0) {
                for (const item of SelectedReceivedFroms) {
                    const [contact, company] = item.split('|');
                    const req = new sql.Request();
                    req.input('RequestNo', sql.NVarChar, id);
                    req.input('ContactName', sql.NVarChar, contact);
                    req.input('CompanyName', sql.NVarChar, company);
                    await req.query(`INSERT INTO ReceivedFrom (RequestNo, ContactName, CompanyName) VALUES (@RequestNo, @ContactName, @CompanyName)`);
                }
            }
        };
        await Promise.all([
            updateRelated('EnquiryCustomer', 'CustomerName', customersToSave),
            updateRelated('EnquiryType', 'TypeName', SelectedEnquiryTypes),
            updateRelated(
                'ConcernedSE',
                'SEName',
                ConcernedSEAssignments && ConcernedSEAssignments.length > 0
                    ? ConcernedSEAssignments
                    : SelectedConcernedSEs
            ),
            updateRelated('EnquiryConsultant', 'ConsultantName', SelectedConsultants),
            updateReceivedFrom(),
        ]);


        // Send Acknowledgement Email on Update if checked - REMOVED per user request
        // if (AutoAck) { ... }

        // Notification
        const modBy = req.body.ModifiedBy || 'System';
        const modUserEmailRes = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE FullName = ${modBy}`;
        const modUserEmail = modUserEmailRes.recordset.length > 0 ? modUserEmailRes.recordset[0].EmailId : null;
        queueCreateNotifications(id, 'Enquiry Update', `Enquiry ${id} updated by ${modBy}`, modUserEmail, modBy);

        res.json({ message: 'Enquiry updated' });
    } catch (err) {
        if (err && err.statusCode === 409 && err.payload) {
            return res.status(409).json(err.payload);
        }
        console.error(err);
        res.status(500).json({ message: err.message || 'Server Error' });
    }
});

// --- Master Data API Routes ---

// 1. Customers (Contractors, Clients, Consultants)
app.get('/api/customers', async (req, res) => {
    try {
        // Use plain SQL strings to avoid template literal issues
        const customersQuery = `
            SELECT ID, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo,
                   'Contractor' as Category
            FROM Master_CustomerName 
            ORDER BY ID DESC
        `;
        const clientsQuery = `
            SELECT ID, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo,
                   'Client' as Category
            FROM Master_ClientName 
            ORDER BY ID DESC
        `;
        const consultantsQuery = `
            SELECT ID, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo,
                   'Consultant' as Category
            FROM Master_ConsultantName 
            ORDER BY ID DESC
        `;

        const customers = await new sql.Request().query(customersQuery);
        const clients = await new sql.Request().query(clientsQuery);
        const consultants = await new sql.Request().query(consultantsQuery);

        console.log('[/api/customers] Contractors:', customers.recordset.length);
        console.log('[/api/customers] Clients:', clients.recordset.length);
        console.log('[/api/customers] Consultants:', consultants.recordset.length);
        if (clients.recordset.length > 0) {
            console.log('[/api/customers] Sample client:', clients.recordset[0]);
        }

        // Combine all
        const all = [...customers.recordset, ...clients.recordset, ...consultants.recordset];
        res.json(all);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.post('/api/customers', async (req, res) => {
    const { CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, Category } = req.body;
    try {
        let result;
        if (Category === 'Client') {
            result = await sql.query`INSERT INTO Master_ClientName (Category, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo)
                            VALUES (${Category}, ${CompanyName}, ${Address1}, ${Address2}, ${Rating}, ${Type}, ${FaxNo}, ${Phone1}, ${Phone2}, ${EmailId}, ${Website}, ${Status}, ${req.body.RequestNo});
                            SELECT SCOPE_IDENTITY() AS ID;`;
        } else if (Category === 'Consultant') {
            result = await sql.query`INSERT INTO Master_ConsultantName (Category, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo)
                            VALUES (${Category}, ${CompanyName}, ${Address1}, ${Address2}, ${Rating}, ${Type}, ${FaxNo}, ${Phone1}, ${Phone2}, ${EmailId}, ${Website}, ${Status}, ${req.body.RequestNo});
                            SELECT SCOPE_IDENTITY() AS ID;`;
        } else {
            // Default to Contractor/Customer
            result = await sql.query`INSERT INTO Master_CustomerName (Category, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo)
                            VALUES (${Category || 'Contractor'}, ${CompanyName}, ${Address1}, ${Address2}, ${Rating}, ${Type}, ${FaxNo}, ${Phone1}, ${Phone2}, ${EmailId}, ${Website}, ${Status}, ${req.body.RequestNo});
                            SELECT SCOPE_IDENTITY() AS ID;`;
        }
        res.status(201).json({ message: 'Customer added', id: result.recordset[0].ID });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.put('/api/customers/:id', async (req, res) => {
    const { id } = req.params;
    const { CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, Category } = req.body;
    try {
        if (Category === 'Client') {
            await sql.query`UPDATE Master_ClientName SET CompanyName=${CompanyName}, Address1=${Address1}, Address2=${Address2}, Rating=${Rating}, Type=${Type}, FaxNo=${FaxNo}, Phone1=${Phone1}, Phone2=${Phone2}, EmailId=${EmailId}, Website=${Website}, Status=${Status} WHERE ID=${id}`;
        } else if (Category === 'Consultant') {
            await sql.query`UPDATE Master_ConsultantName SET CompanyName=${CompanyName}, Address1=${Address1}, Address2=${Address2}, Rating=${Rating}, Type=${Type}, FaxNo=${FaxNo}, Phone1=${Phone1}, Phone2=${Phone2}, EmailId=${EmailId}, Website=${Website}, Status=${Status} WHERE ID=${id}`;
        } else {
            await sql.query`UPDATE Master_CustomerName SET CompanyName=${CompanyName}, Address1=${Address1}, Address2=${Address2}, Rating=${Rating}, Type=${Type}, FaxNo=${FaxNo}, Phone1=${Phone1}, Phone2=${Phone2}, EmailId=${EmailId}, Website=${Website}, Status=${Status} WHERE ID=${id}`;
        }
        res.json({ message: 'Customer updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 2. Contacts (Received From)
app.get('/api/contacts', async (req, res) => {
    try {
        const result = await sql.query`SELECT * FROM Master_ReceivedFrom ORDER BY ID DESC`;
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.post('/api/contacts', async (req, res) => {
    console.log('POST /api/contacts - Payload:', req.body);
    const { Category, CompanyName, Prefix, ContactName, Designation, CategoryOfDesignation, Address1, Address2, FaxNo, Phone, Mobile1, Mobile2, EmailId, RequestNo } = req.body;
    try {
        const result = await sql.query`INSERT INTO Master_ReceivedFrom (Category, CompanyName, Prefix, ContactName, Designation, CategoryOfDesignation, Address1, Address2, FaxNo, Phone, Mobile1, Mobile2, EmailId, RequestNo)
                        VALUES (${Category}, ${CompanyName}, ${Prefix}, ${ContactName}, ${Designation}, ${CategoryOfDesignation}, ${Address1}, ${Address2}, ${FaxNo}, ${Phone}, ${Mobile1}, ${Mobile2}, ${EmailId}, ${RequestNo});
                        SELECT SCOPE_IDENTITY() AS ID;`;
        res.status(201).json({ message: 'Contact added', id: result.recordset[0].ID });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.put('/api/contacts/:id', async (req, res) => {
    const fs = require('fs');
    fs.appendFileSync('debug_payload.log', `PUT /api/contacts/${req.params.id} Payload: ${JSON.stringify(req.body)}\n`);
    console.log('PUT /api/contacts/:id - Payload:', req.body);
    const { id } = req.params;
    const { Category, CompanyName, Prefix, ContactName, Designation, CategoryOfDesignation, Address1, Address2, FaxNo, Phone, Mobile1, Mobile2, EmailId } = req.body;
    try {
        await sql.query`UPDATE Master_ReceivedFrom SET Category=${Category}, CompanyName=${CompanyName}, Prefix=${Prefix}, ContactName=${ContactName}, Designation=${Designation}, CategoryOfDesignation=${CategoryOfDesignation}, Address1=${Address1}, Address2=${Address2}, FaxNo=${FaxNo}, Phone=${Phone}, Mobile1=${Mobile1}, Mobile2=${Mobile2}, EmailId=${EmailId} WHERE ID=${id}`;
        res.json({ message: 'Contact updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 3. Users (Concerned SE)
app.get('/api/users', async (req, res) => {
    try {
        const result = await sql.query`SELECT * FROM Master_ConcernedSE ORDER BY ID DESC`;
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// DEBUG ENDPOINT TO VERIFY CODE VERSION
app.get('/api/version', (req, res) => {
    res.json({ version: 'v2-fixed', timestamp: new Date() });
});

app.post('/api/users', async (req, res) => {
    const { FullName, Designation, EmailId, MobileNumber, LoginPassword, Status, Department, Roles, RequestNo, ModifiedBy } = req.body;

    try {
        let hashedPassword = null;
        if (LoginPassword && LoginPassword.trim().length > 0) {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(LoginPassword, salt);
        }

        // Insert and get ID
        const result = await sql.query`
            INSERT INTO Master_ConcernedSE (FullName, Designation, EmailId, MobileNumber, LoginPassword, Status, Department, Roles, RequestNo)
            VALUES (${FullName}, ${Designation}, ${EmailId}, ${MobileNumber}, ${hashedPassword}, ${Status}, ${Department}, ${Roles}, ${RequestNo});
            SELECT SCOPE_IDENTITY() AS ID;
        `;

        const newUserId = result.recordset[0].ID;

        // Notification
        const displayRoles = Array.isArray(Roles) ? Roles.join(', ') : Roles;
        const msg = `Welcome to EMS! Your account has been created with roles: ${displayRoles}.`;
        const adminName = ModifiedBy || 'Admin';

        if (!isExcludedNotificationEmail(EmailId)) {
            await sql.query`
                INSERT INTO Notifications (UserID, Type, Message, LinkID, CreatedBy)
                VALUES (${newUserId}, 'System', ${msg}, 'Profile', ${adminName})
            `;
        }

        res.status(201).json({ message: 'User added', id: newUserId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { FullName, Designation, EmailId, MobileNumber, Status, Department, Roles, ModifiedBy } = req.body; // Expect ModifiedBy (Admin Name)
    try {
        // Note: Password update logic should be separate or handled carefully. Skipping password update here for simplicity unless provided.
        await sql.query`UPDATE Master_ConcernedSE SET FullName=${FullName}, Designation=${Designation}, EmailId=${EmailId}, MobileNumber=${MobileNumber}, Status=${Status}, Department=${Department}, Roles=${Roles} WHERE ID=${id}`;

        // Notify the user
        const displayRoles = Array.isArray(Roles) ? Roles.join(', ') : Roles;
        const msg = `Your roles have been updated to: ${displayRoles}. Please refresh your page.`;
        const adminName = ModifiedBy || 'Admin';

        if (!isExcludedNotificationEmail(EmailId)) {
            await sql.query`
                INSERT INTO Notifications (UserID, Type, Message, LinkID, CreatedBy)
                VALUES (${id}, 'System', ${msg}, 'Profile', ${adminName})
            `;
        }

        res.json({ message: 'User updated and notified' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        console.log(`Deleting user with ID: ${id}`);
        // 1. Delete notifications related to this user (Clean up)
        await sql.query`DELETE FROM Notifications WHERE UserID = ${id}`;

        // 2. Delete the user
        // Note: If there are other foreign keys (e.g. EnquiryMaster.CreatedBy), this might still fail if UserID is used there.
        // However, standard master tables usually don't cascade delete.
        // If "Remove" is requested, we assume hard delete.
        await sql.query`DELETE FROM Master_ConcernedSE WHERE ID = ${id}`;

        res.json({ message: 'User deleted' });
    } catch (err) {
        console.error('Delete User Error:', err);
        res.status(500).json({ message: 'Server Error', detail: err.message });
    }
});



// 4. Enquiry Items (Enquiry For)


app.get('/api/enquiry-items', async (req, res) => {
    try {
        const result = await sql.query`SELECT * FROM Master_EnquiryFor ORDER BY ID DESC`;
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.post('/api/enquiry-items', async (req, res) => {
    const { ItemName, CompanyName, DepartmentName, Status, CommonMailIds, CCMailIds, RequestNo, DivisionCode, DepartmentCode, Phone, Address, FaxNo, CompanyLogo } = req.body;
    try {
        const result = await sql.query`INSERT INTO Master_EnquiryFor (ItemName, CompanyName, DepartmentName, Status, CommonMailIds, CCMailIds, RequestNo, DivisionCode, DepartmentCode, Phone, Address, FaxNo, CompanyLogo)
                        VALUES (${ItemName}, ${CompanyName}, ${DepartmentName}, ${Status}, ${CommonMailIds}, ${CCMailIds}, ${RequestNo}, ${DivisionCode}, ${DepartmentCode}, ${Phone}, ${Address}, ${FaxNo}, ${CompanyLogo});
                        SELECT SCOPE_IDENTITY() AS ID;`;
        res.status(201).json({ message: 'Item added', id: result.recordset[0].ID });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.put('/api/enquiry-items/:id', async (req, res) => {
    const { id } = req.params;
    const { ItemName, CompanyName, DepartmentName, Status, CommonMailIds, CCMailIds, DivisionCode, DepartmentCode, Phone, Address, FaxNo, CompanyLogo } = req.body;
    try {
        await sql.query`UPDATE Master_EnquiryFor SET ItemName=${ItemName}, CompanyName=${CompanyName}, DepartmentName=${DepartmentName}, Status=${Status}, CommonMailIds=${CommonMailIds}, CCMailIds=${CCMailIds}, DivisionCode=${DivisionCode}, DepartmentCode=${DepartmentCode}, Phone=${Phone}, Address=${Address}, FaxNo=${FaxNo}, CompanyLogo=${CompanyLogo} WHERE ID=${id}`;
        res.json({ message: 'Item updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});
// --- Attachments API ---
const normalizeAttachmentEmail = (raw) =>
    String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com/g, '@almoayyedcg.com');

const normText = (raw) => String(raw || '').trim().toLowerCase();

async function getAttachmentAccessContext(requestNo, rawUserEmail, userRole) {
    const email = normalizeAttachmentEmail(rawUserEmail);
    if (!email) return { allowed: false, reason: 'Missing userEmail', user: null, fullAccess: false };

    const isAdminFromRole = roleIsAdmin(userRole) || email === 'ranigovardhan@gmail.com';

    const userRes = await new sql.Request()
        .input('email', sql.NVarChar, email)
        .query(`
            SELECT TOP 1 FullName, Department, EmailId, Roles
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(EmailId, ''), '@almcg.com', '@almoayyedcg.com'), '@ALMCG.COM', '@almoayyedcg.com'))))
                  = LOWER(LTRIM(RTRIM(@email)))
        `);
    const user = userRes.recordset?.[0];
    if (!user && !isAdminFromRole) {
        return { allowed: false, reason: 'User not found', user: null, fullAccess: false };
    }

    const fullName = String(user?.FullName || '').trim();
    const department = String(user?.Department || '').trim();
    const isAdmin = isAdminFromRole || roleIsAdmin(user?.Roles);
    const isManagement = department.toLowerCase() === 'management';

    const ccRes = await new sql.Request()
        .input('email', sql.NVarChar, email)
        .query(`
            SELECT TOP 1 1 AS ok
            FROM Master_EnquiryFor
            WHERE ',' + REPLACE(REPLACE(ISNULL(CCMailIds, ''), ' ', ''), ';', ',') + ','
                  LIKE '%,' + @email + ',%'
        `);
    const isCcUser = (ccRes.recordset || []).length > 0 || isManagement;

    const reqNo = String(requestNo || '').trim();
    const enqRes = await new sql.Request()
        .input('requestNo', sql.NVarChar, reqNo)
        .query(`
            SELECT TOP 1 CreatedBy
            FROM EnquiryMaster
            WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(@requestNo))
        `);
    const createdBy = String(enqRes.recordset?.[0]?.CreatedBy || '').trim();
    let isCreator = false;
    if (createdBy) {
        if (createdBy.includes('@')) {
            isCreator = normalizeAttachmentEmail(createdBy) === email;
        } else if (fullName) {
            isCreator = createdBy.toUpperCase().trim() === fullName.toUpperCase().trim();
        }
    }

    const assignedRes = await new sql.Request()
        .input('requestNo', sql.NVarChar, reqNo)
        .input('fullName', sql.NVarChar, fullName)
        .query(`
            SELECT TOP 1 1 AS ok
            FROM ConcernedSE
            WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(@requestNo))
              AND LOWER(LTRIM(RTRIM(ISNULL(SEName, '')))) = LOWER(LTRIM(RTRIM(ISNULL(@fullName, ''))))
        `);
    const isAssigned = (assignedRes.recordset || []).length > 0;

    const fullAccess = isAdmin || isCcUser || isCreator;
    const allowed = fullAccess || isAssigned;

    return {
        allowed,
        fullAccess,
        isAdmin,
        isCcUser,
        isCreator,
        isAssigned,
        reason: allowed ? null : 'Not assigned to enquiry',
        user: {
            fullName,
            department,
            email: normalizeAttachmentEmail(user?.EmailId || email)
        }
    };
}

function canReadAttachmentByVisibility(att, accessCtx) {
    if (!accessCtx?.allowed) return false;
    if (accessCtx.fullAccess || accessCtx.isAdmin) return true;

    const visibility = normText(att.Visibility || 'Public');
    if (visibility !== 'private') return true;

    const uploadedBy = normText(att.UploadedBy || '');
    const userName = normText(accessCtx.user?.fullName || '');
    if (uploadedBy && userName && uploadedBy === userName) return true;

    const attDivision = normText(att.Division || '');
    const userDept = normText(accessCtx.user?.department || '');
    if (!attDivision || !userDept) return false;
    return attDivision === userDept;
}

// Upload Attachment - Store in DB
// Upload Attachment - Store in Disk and DB (files land under ENQUIRY_ATTACHMENTS_ROOT/<RequestNo>/)
app.post('/api/attachments/upload', (req, res, next) => {
    try {
        const visibility = req.query.visibility || 'Public';
        const division = req.query.division || 'General';
        const requestNo = req.query.requestNo;
        if (requestNo) {
            const resolved = resolveWritableEnquiryUploadDestination(requestNo, visibility, division);
            console.log('[attachments/upload] destination:', resolved.dest, resolved.usedFallback ? '(local fallback)' : '');
            if (resolved.usedFallback) {
                console.warn('[attachments/upload] primary not writable:', resolved.primaryAttempted);
            }
        }
    } catch (err) {
        console.error('[attachments/upload] Cannot resolve writable attachment folder:', err.message);
        return res.status(500).json({
            message: 'Attachment storage is not available.',
            detail: err.message,
            hint: 'Set ENQUIRY_ATTACHMENTS_ROOT to a local path, e.g. C:\\inetpub\\wwwroot\\EMS\\data\\ems-attachments',
        });
    }
    next();
}, runEnquiryAttachmentUpload, async (req, res) => {
    const requestNo = req.query.requestNo;
    const visibility = req.query.visibility || 'Public';
    const type = req.query.type || 'File';
    const linkUrl = req.query.linkUrl || null;
    const uploadedBy = req.query.userName || 'System';
    const division = sanitizeFolderName(req.query.division, 'General');

    console.log('Upload request:', { requestNo, visibility, type, uploadedBy, division });

    if (!requestNo) {
        return res.status(400).send('Request No is required');
    }

    const files = req.files;

    try {
        const uploadedFiles = [];

        // Handle Hyperlink case
        if (type === 'Link' && linkUrl) {
            const fileName = req.query.fileName || linkUrl;
            await sql.query`INSERT INTO Attachments (RequestNo, FileName, FilePath, UploadedAt, Visibility, AttachmentType, LinkURL, UploadedBy, Division) 
            VALUES(${requestNo}, ${fileName}, NULL, ${new Date()}, ${visibility}, 'Link', ${linkUrl}, ${uploadedBy}, ${division})`;
            uploadedFiles.push({ fileName });
        }

        // Handle Files
        if (files && files.length > 0) {
            for (const file of files) {
                const rawName = String(file.originalname || file.filename || 'file').trim() || 'file';
                const fileName = rawName.length > 255 ? rawName.slice(-255) : rawName;
                const filePath = file.path;

                if (!filePath || !fs.existsSync(filePath)) {
                    console.error('[attachments/upload] file missing after multer write:', filePath);
                    return res.status(500).json({
                        message: 'Upload failed: file was not written to storage',
                        hint: 'Verify ENQUIRY_ATTACHMENTS_ROOT and that the Windows account running Node can create files on that UNC share.',
                        attemptedPath: filePath || null,
                    });
                }

                // Check if RequestNo exists in EnquiryMaster to avoid FK violation
                const checkEnq = await sql.query`SELECT RequestNo FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
                if (checkEnq.recordset.length === 0) {
                    throw new Error(`RequestNo ${requestNo} not found in EnquiryMaster`);
                }

                await sql.query`INSERT INTO Attachments (RequestNo, FileName, FilePath, UploadedAt, Visibility, AttachmentType, LinkURL, UploadedBy, Division) 
                VALUES(${requestNo}, ${fileName}, ${filePath}, ${new Date()}, ${visibility}, 'File', NULL, ${uploadedBy}, ${division})`;

                uploadedFiles.push({ fileName });
            }
        }

        res.status(201).json({ message: 'Success', files: uploadedFiles });
    } catch (err) {
        const formatted = formatRouteError(err);
        console.error('[attachments/upload] error:', err);
        res.status(500).json({
            ...formatted,
            hint: 'Check PM2 logs (pm2 logs EMS-API). Verify the PM2 Windows account can write to ENQUIRY_ATTACHMENTS_ROOT on the UNC share.',
        });
    }
});

// --- System Routes ---

// Get Next Request No
app.get('/api/system/next-request-no', async (req, res) => {
    try {
        const nextId = await previewNextRequestNo();
        console.log(`[NextID] Returning preview: ${nextId}`);
        res.json({ nextId });
    } catch (err) {
        console.error('Error generating next ID:', err);
        res.status(500).json({ message: 'Error generating ID' });
    }
});

// Get Attachments List
app.get('/api/attachments', async (req, res) => {
    const requestNo = req.query.requestNo;
    const userEmail = req.query.userEmail || '';
    const userRole = req.query.userRole || '';
    if (!requestNo) {
        return res.status(400).send('Request No is required');
    }

    try {
        const accessCtx = await getAttachmentAccessContext(requestNo, userEmail, userRole);
        if (!accessCtx.allowed) {
            return res.status(403).json({ error: accessCtx.reason || 'Access denied' });
        }
        const result = await sql.query`SELECT ID, RequestNo, FileName, UploadedAt, Visibility, AttachmentType, LinkURL, UploadedBy, Division FROM Attachments WHERE RequestNo = ${requestNo} `;
        const rows = (result.recordset || []).filter((r) => canReadAttachmentByVisibility(r, accessCtx));
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// Download Attachment
app.get('/api/attachments/:id', async (req, res) => {
    const { id } = req.params;
    const userEmail = req.query.userEmail || '';
    const userRole = req.query.userRole || '';
    try {
        const result = await sql.query`SELECT ID, RequestNo, FileName, FilePath, Visibility, Division, UploadedBy FROM Attachments WHERE ID = ${id} `;
        const attachment = result.recordset[0];

        if (!attachment) {
            return res.status(404).send('Attachment not found');
        }
        const accessCtx = await getAttachmentAccessContext(attachment.RequestNo, userEmail, userRole);
        if (!canReadAttachmentByVisibility(attachment, accessCtx)) {
            return res.status(403).json({ error: accessCtx.reason || 'Access denied' });
        }

        const filePath = attachment.FilePath;
        if (fs.existsSync(filePath)) {
            const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
            res.setHeader('Content-Disposition', `${disposition}; filename = "${attachment.FileName}"`);
            res.sendFile(filePath);
        } else {
            res.status(404).send('File not found on server');
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// Delete Attachment
app.delete('/api/attachments/:id', async (req, res) => {
    const { id } = req.params;
    const userEmail = req.query.userEmail || '';
    const userRole = req.query.userRole || '';
    try {
        // Get file path first
        const result = await sql.query`SELECT RequestNo, FilePath, Visibility, Division, UploadedBy FROM Attachments WHERE ID = ${id} `;
        if (result.recordset.length > 0) {
            const att = result.recordset[0];
            const accessCtx = await getAttachmentAccessContext(att.RequestNo, userEmail, userRole);
            if (!canReadAttachmentByVisibility(att, accessCtx)) {
                return res.status(403).json({ error: accessCtx.reason || 'Access denied' });
            }
            const filePath = att.FilePath;
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await sql.query`DELETE FROM Attachments WHERE ID = ${id} `;

        res.json({ message: 'Attachment deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// Update Profile Image
app.post('/api/auth/update-profile-image', async (req, res) => {
    const { userId, imageBase64 } = req.body;
    try {
        await sql.query`UPDATE Master_ConcernedSE SET ProfileImage = ${imageBase64} WHERE ID = ${userId} `;
        res.json({ message: 'Profile image updated' });
    } catch (err) {
        console.error('Error updating profile image:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Notifications API ---
const parseNotificationQueryInt = (value, fallback, max) => {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.min(parsed, max);
};

app.get('/api/notifications/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const history = String(req.query.history || '').toLowerCase() === '1'
            || String(req.query.view || '').toLowerCase() === 'history';
        const limit = parseNotificationQueryInt(req.query.limit, history ? 30 : 50, 200);
        const offset = parseNotificationQueryInt(req.query.offset, 0, 10000);

        if (history) {
            const [countResult, listResult] = await Promise.all([
                sql.query`
                    SELECT COUNT(*) AS Total
                    FROM Notifications
                    WHERE UserID = ${userId}
                      AND IsAcknowledged = 1`,
                sql.query`
                    SELECT ID, UserID, Type, Message, LinkID, IsRead, IsAcknowledged, AcknowledgedAt, CreatedAt, CreatedBy
                    FROM Notifications
                    WHERE UserID = ${userId}
                      AND IsAcknowledged = 1
                    ORDER BY AcknowledgedAt DESC, CreatedAt DESC
                    OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`,
            ]);
            const total = countResult.recordset[0]?.Total ?? 0;
            const items = listResult.recordset;
            res.json({
                items,
                total,
                hasMore: offset + items.length < total,
            });
            return;
        }

        const listResult = await sql.query`
            SELECT ID, UserID, Type, Message, LinkID, IsRead, IsAcknowledged, AcknowledgedAt, CreatedAt, CreatedBy
            FROM Notifications
            WHERE UserID = ${userId}
              AND (IsAcknowledged = 0 OR IsAcknowledged IS NULL)
            ORDER BY CreatedAt DESC
            OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
        const items = listResult.recordset;
        res.json({
            items,
            total: items.length,
            hasMore: items.length === limit,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.get('/api/notifications/:userId/count', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await sql.query`
            SELECT COUNT(*) AS ActiveCount
            FROM Notifications
            WHERE UserID = ${userId}
              AND (IsAcknowledged = 0 OR IsAcknowledged IS NULL)`;
        res.json({ count: result.recordset[0]?.ActiveCount ?? 0 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        await sql.query`UPDATE Notifications SET IsRead = 1 WHERE ID = ${id}`;
        res.json({ message: 'Marked as read' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.put('/api/notifications/:id/ack', async (req, res) => {
    try {
        const { id } = req.params;
        await sql.query`
            UPDATE Notifications
            SET IsAcknowledged = 1,
                AcknowledgedAt = GETDATE(),
                IsRead = 1
            WHERE ID = ${id}`;
        res.json({ message: 'Notification acknowledged' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// Acknowledge all active notifications (moves them to history)
app.put('/api/notifications/:userId/ack-all', async (req, res) => {
    try {
        const { userId } = req.params;
        await sql.query`
            UPDATE Notifications
            SET IsAcknowledged = 1,
                AcknowledgedAt = GETDATE(),
                IsRead = 1
            WHERE UserID = ${userId}
              AND (IsAcknowledged = 0 OR IsAcknowledged IS NULL)`;
        res.json({ message: 'All notifications acknowledged' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// Clear All Notifications (legacy delete — kept for compatibility)
app.delete('/api/notifications/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        await sql.query`DELETE FROM Notifications WHERE UserID = ${userId}`;
        res.json({ message: 'All notifications cleared' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// Get Notes
app.get('/api/enquiries/:id/notes', async (req, res) => {
    try {
        const enquiryId = decodeURIComponent(req.params.id);
        const result = await sql.query`SELECT * FROM EnquiryNotes WHERE EnquiryID = ${enquiryId} ORDER BY CreatedAt ASC`;
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching notes:', err);
        res.status(500).json({ message: err.message || 'Server Error' });
    }
});

// Add Note
app.post('/api/enquiries/:id/notes', async (req, res) => {
    const { userId, userName, userProfileImage, content } = req.body;
    const enquiryId = decodeURIComponent(req.params.id);
    try {
        const request = new sql.Request();
        request.input('EnquiryID', sql.NVarChar, enquiryId); // Assuming RequestNo is string
        request.input('UserID', sql.Int, userId);
        request.input('UserName', sql.NVarChar, userName);
        request.input('UserProfileImage', sql.NVarChar, userProfileImage);
        request.input('NoteContent', sql.NVarChar, content);

        const now = new Date();
        await request.query`
            INSERT INTO EnquiryNotes(EnquiryID, UserID, UserName, UserProfileImage, NoteContent, CreatedAt)
            VALUES(@EnquiryID, @UserID, @UserName, @UserProfileImage, @NoteContent, ${now})
        `;

        // Notify assigned enquiry members + enquiry-linked distribution (see createNotifications)
        const uRes = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE ID = ${userId}`;
        const uEmail = uRes.recordset.length > 0
            ? String(uRes.recordset[0].EmailId || '').trim().toLowerCase()
            : null;
        const noteMessage = `New collaborative note on enquiry ${enquiryId} from ${userName}`;
        queueCreateNotifications(enquiryId, 'Note', noteMessage, uEmail, userName);

        // Mention Logic
        try {
            const allUsers = await sql.query`SELECT FullName, ID, EmailId FROM Master_ConcernedSE`;
            for (const u of allUsers.recordset) {
                // Create regex for case-insensitive match of @FullName
                const mentionRegex = new RegExp(`@${u.FullName} `, 'i');
                if (mentionRegex.test(content)) {
                    if (u.ID !== userId && !isExcludedNotificationEmail(u.EmailId)) {
                        const now = new Date();
                        await sql.query`INSERT INTO Notifications(UserID, Type, Message, LinkID, CreatedBy, CreatedAt) VALUES(${u.ID}, 'Mention', ${userName + ' mentioned you in a note'}, ${enquiryId}, ${userName}, ${now})`;
                    }
                }
            }
        } catch (mentionErr) {
            console.error('Mention error:', mentionErr);
        }

        res.sendStatus(201);
    } catch (err) {
        console.error('Error adding note:', err);
        res.status(500).json({ message: err.message || 'Server Error' });
    }
});



const initApp = async () => {
    try {
        await connectDBWithRetry();
        console.log('Database connected successfully.');
        startDbKeepAlive();

        // Check if ProfileImage column exists in Master_ConcernedSE
        try {
            const checkColumn = await sql.query`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'Master_ConcernedSE' AND COLUMN_NAME = 'ProfileImage'
    `;

            if (checkColumn.recordset.length === 0) {
                console.log('Adding ProfileImage column to Master_ConcernedSE...');
                await sql.query`ALTER TABLE Master_ConcernedSE ADD ProfileImage NVARCHAR(MAX)`;
                console.log('ProfileImage column added.');
            }

            // Check ParentID in EnquiryFor
            const checkParentID = await sql.query`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'EnquiryFor' AND COLUMN_NAME = 'ParentID'
            `;
            if (checkParentID.recordset.length === 0) {
                console.log('Adding ParentID column to EnquiryFor...');
                await sql.query`ALTER TABLE EnquiryFor ADD ParentID INT NULL`;
                console.log('ParentID column added.');
            }

            const checkLeadJobName = await sql.query`
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'EnquiryFor' AND COLUMN_NAME = 'LeadJobName'
            `;
            if (checkLeadJobName.recordset.length === 0) {
                console.log('Adding LeadJobName column to EnquiryFor...');
                await sql.query`ALTER TABLE EnquiryFor ADD LeadJobName NVARCHAR(200) NULL`;
                console.log('LeadJobName column added.');
            }

            // Ensure DB trigger never writes project name into LeadJobCode.
            await sql.query(`
                IF OBJECT_ID('dbo.trg_EnquiryFor_LeadJobCode', 'TR') IS NOT NULL
                    DROP TRIGGER dbo.trg_EnquiryFor_LeadJobCode;
            `);
            await sql.query(`
                CREATE TRIGGER dbo.trg_EnquiryFor_LeadJobCode
                ON dbo.EnquiryFor
                AFTER INSERT, UPDATE
                AS
                BEGIN
                    SET NOCOUNT ON;

                    ;WITH AffectedReq AS (
                        SELECT DISTINCT CAST(i.RequestNo AS NVARCHAR(50)) AS RequestNo
                        FROM inserted i
                        WHERE i.RequestNo IS NOT NULL
                    ),
                    RootList AS (
                        SELECT
                            ef.RequestNo,
                            ef.ID AS RootID,
                            ef.ItemName AS RootName,
                            CONCAT('L', ROW_NUMBER() OVER (PARTITION BY ef.RequestNo ORDER BY ef.ID)) AS RootCode
                        FROM dbo.EnquiryFor ef
                        INNER JOIN AffectedReq ar
                            ON CAST(ef.RequestNo AS NVARCHAR(50)) = ar.RequestNo
                        WHERE ef.ParentID IS NULL OR ef.ParentID = 0
                    ),
                    Hier AS (
                        SELECT
                            r.RequestNo,
                            r.RootID,
                            r.RootName,
                            r.RootCode,
                            ef.ID,
                            ef.ParentID
                        FROM dbo.EnquiryFor ef
                        INNER JOIN RootList r ON ef.ID = r.RootID
                        UNION ALL
                        SELECT
                            h.RequestNo,
                            h.RootID,
                            h.RootName,
                            h.RootCode,
                            c.ID,
                            c.ParentID
                        FROM dbo.EnquiryFor c
                        INNER JOIN Hier h ON c.ParentID = h.ID
                    )
                    UPDATE ef
                    SET
                        LeadJobCode = h.RootCode,
                        LeadJobName = h.RootName
                    FROM dbo.EnquiryFor ef
                    INNER JOIN Hier h ON ef.ID = h.ID
                    OPTION (MAXRECURSION 32767);
                END;
            `);
            console.log('Ensured trigger trg_EnquiryFor_LeadJobCode uses L# normalization.');

            if (process.env.EMS_NORMALIZE_LEAD_META_ON_STARTUP === '1') {
                console.log('Normalizing EnquiryFor LeadJobCode/LeadJobName for all requests...');
                await normalizeAllEnquiryForLeadMeta();
                console.log('Lead metadata normalization completed.');
            } else {
                console.log(
                    'Skipping full lead metadata normalization on startup (set EMS_NORMALIZE_LEAD_META_ON_STARTUP=1 to enable).'
                );
            }

            const { startSiteVisitReminderScheduler } = require('./lib/siteVisitReminderScheduler');
            startSiteVisitReminderScheduler();

            // Check LostDate in EnquiryMaster
            const checkLostDate = await sql.query`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'EnquiryMaster' AND COLUMN_NAME = 'LostDate'
            `;
            if (checkLostDate.recordset.length === 0) {
                console.log('Adding LostDate column to EnquiryMaster...');
                await sql.query`ALTER TABLE EnquiryMaster ADD LostDate DATETIME NULL`;
                console.log('LostDate column added.');
            }

            const checkNotifAck = await sql.query`
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'Notifications' AND COLUMN_NAME = 'IsAcknowledged'
            `;
            if (checkNotifAck.recordset.length === 0) {
                console.log('Adding IsAcknowledged column to Notifications...');
                await sql.query`ALTER TABLE Notifications ADD IsAcknowledged BIT NOT NULL DEFAULT 0`;
                console.log('IsAcknowledged column added.');
            }

            const checkNotifAckAt = await sql.query`
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'Notifications' AND COLUMN_NAME = 'AcknowledgedAt'
            `;
            if (checkNotifAckAt.recordset.length === 0) {
                console.log('Adding AcknowledgedAt column to Notifications...');
                await sql.query`ALTER TABLE Notifications ADD AcknowledgedAt DATETIME NULL`;
                console.log('AcknowledgedAt column added.');
            }

            const checkNotifActiveIdx = await sql.query`
                SELECT name FROM sys.indexes
                WHERE object_id = OBJECT_ID('Notifications') AND name = 'IX_Notifications_UserID_Active'`;
            if (checkNotifActiveIdx.recordset.length === 0) {
                console.log('Creating IX_Notifications_UserID_Active index...');
                await sql.query`
                    CREATE INDEX IX_Notifications_UserID_Active
                        ON Notifications (UserID, CreatedAt DESC)
                        WHERE IsAcknowledged = 0`;
                console.log('IX_Notifications_UserID_Active created.');
            }

            const checkNotifHistoryIdx = await sql.query`
                SELECT name FROM sys.indexes
                WHERE object_id = OBJECT_ID('Notifications') AND name = 'IX_Notifications_UserID_History'`;
            if (checkNotifHistoryIdx.recordset.length === 0) {
                console.log('Creating IX_Notifications_UserID_History index...');
                await sql.query`
                    CREATE INDEX IX_Notifications_UserID_History
                        ON Notifications (UserID, AcknowledgedAt DESC, CreatedAt DESC)
                        WHERE IsAcknowledged = 1`;
                console.log('IX_Notifications_UserID_History created.');
            }

            // Check if EnquiryNotes table exists
            const checkNotesTable = await sql.query`
SELECT * FROM sysobjects WHERE name = 'EnquiryNotes' AND xtype = 'U'
    `;
            if (checkNotesTable.recordset.length === 0) {
                console.log('Creating EnquiryNotes table...');
                await sql.query`
                    CREATE TABLE EnquiryNotes(
        ID INT IDENTITY(1, 1) PRIMARY KEY,
        EnquiryID INT NOT NULL,
        UserID INT NOT NULL,
        UserName NVARCHAR(255),
        UserProfileImage NVARCHAR(MAX),
        NoteContent NVARCHAR(MAX),
        CreatedAt DATETIME DEFAULT GETDATE()
    )
                 `;
                console.log('EnquiryNotes table created.');
            }
        } catch (schemaErr) {
            console.error('Schema check error:', schemaErr);
        }

    } catch (err) {
        console.error('Database Initialization Failed:', err);
        process.exit(1);
    }
};

// NEW ENDPOINT for Triggering Email manually (usually after file upload)
app.post('/api/enquiries/notify', async (req, res) => {
    try {
        const { requestNo, userEmail, userDisplayName } = req.body;
        console.log('Received notification request for:', requestNo);
        if (!requestNo) return res.status(400).json({ success: false, message: 'RequestNo required' });

        // 1–2. Fetch enquiry + attachments in parallel (was sequential).
        const [enqResult, attResult] = await Promise.all([
            sql.query`SELECT * FROM EnquiryMaster WHERE RequestNo = ${requestNo}`,
            sql.query`SELECT * FROM Attachments WHERE RequestNo = ${requestNo}`,
        ]);
        if (enqResult.recordset.length === 0) return res.status(404).json({ success: false, message: 'Enquiry not found' });
        const enquiryData = enqResult.recordset[0];
        const attachments = attResult.recordset || [];
        console.log(`Found ${attachments.length} attachments for RequestNo ${requestNo}`);

        // 3. To-recipients: one JOIN (replaces N+1 ConcernedSE → Master_ConcernedSE lookups).
        const recipientEmails = new Set();
        const seJoined = await sql.query`
            SELECT DISTINCT LOWER(LTRIM(RTRIM(m.EmailId))) AS EmailIdNorm
            FROM ConcernedSE cs
            INNER JOIN Master_ConcernedSE m
              ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
            WHERE cs.RequestNo = ${requestNo}
              AND LTRIM(RTRIM(ISNULL(m.EmailId, N''))) <> N''
        `;
        for (const row of seJoined.recordset || []) {
            if (row.EmailIdNorm) recipientEmails.add(row.EmailIdNorm);
        }

        if (enquiryData.AcknowledgementSE) {
            const ackRes = await sql.query`
                SELECT TOP 1 LOWER(LTRIM(RTRIM(EmailId))) AS EmailIdNorm
                FROM Master_ConcernedSE
                WHERE UPPER(LTRIM(RTRIM(ISNULL(FullName, N'')))) = UPPER(LTRIM(RTRIM(${String(enquiryData.AcknowledgementSE)})))
                  AND LTRIM(RTRIM(ISNULL(EmailId, N''))) <> N''
            `;
            const ack = ackRes.recordset?.[0]?.EmailIdNorm;
            if (ack) recipientEmails.add(ack);
        }

        // 4. CC from EnquiryFor → Master_EnquiryFor (one query; mirrors quote/pricing join pattern).
        const ccEmails = new Set();
        try {
            const ccRes = await sql.query`
                SELECT DISTINCT M.CCMailIds
                FROM dbo.EnquiryFor E
                INNER JOIN dbo.Master_EnquiryFor M ON (
                    E.ItemName = M.ItemName
                    OR E.ItemName LIKE N'% - ' + M.ItemName
                    OR E.ItemName LIKE N'%- ' + M.ItemName
                    OR E.ItemName LIKE M.ItemName + N' %'
                )
                WHERE E.RequestNo = ${requestNo}
                  AND LTRIM(RTRIM(ISNULL(M.CCMailIds, N''))) <> N''
            `;
            for (const row of ccRes.recordset || []) {
                if (row.CCMailIds) {
                    String(row.CCMailIds)
                        .split(/[,;]/g)
                        .map((e) => e.trim().toLowerCase())
                        .filter(Boolean)
                        .forEach((e) => ccEmails.add(e));
                }
            }
        } catch (ccErr) {
            console.error(`Error fetching Item CCs for notification: ${ccErr.message}`);
        }

        // Legacy path: EnquiryMaster may store SelectedEnquiryFor on some builds.
        if (ccEmails.size === 0 && enquiryData.SelectedEnquiryFor) {
            let items = [];
            try {
                items = JSON.parse(enquiryData.SelectedEnquiryFor);
            } catch (e) {
                items =
                    typeof enquiryData.SelectedEnquiryFor === 'string'
                        ? enquiryData.SelectedEnquiryFor.split(',').map((s) => s.trim())
                        : [];
            }
            if (Array.isArray(items) && items.length > 0) {
                const safe = items
                    .map((i) => (typeof i === 'object' && i ? i.itemName || i.ItemName : i))
                    .filter(Boolean)
                    .map((s) => String(s).replace(/'/g, "''"));
                if (safe.length > 0) {
                    try {
                        const itemsRes = await sql.query(
                            `SELECT CCMailIds FROM Master_EnquiryFor WHERE ItemName IN (${safe.map((n) => `'${n}'`).join(',')})`
                        );
                        itemsRes.recordset.forEach((row) => {
                            if (row.CCMailIds) {
                                String(row.CCMailIds)
                                    .split(/[,;]/g)
                                    .map((e) => e.trim().toLowerCase())
                                    .filter(Boolean)
                                    .forEach((e) => ccEmails.add(e));
                            }
                        });
                    } catch (ccErr2) {
                        console.error(`Error fetching legacy Item CCs: ${ccErr2.message}`);
                    }
                }
            }
        }

        const toList = filterNotificationEmails(Array.from(recipientEmails));
        const ccList = filterNotificationEmails(Array.from(ccEmails)).filter((e) => !toList.includes(e));

        console.log(`Notification To: ${toList.join(', ')}`);
        console.log(`Notification CC: ${ccList.join(', ')}`);

        // Respond immediately — SMTP sendMail can take 30s+ and must not block HTTP.
        res.json({ success: true, message: 'Notification queued', queued: true });

        const mailPayload = {
            enquiry: enquiryData,
            to: toList,
            cc: ccList,
            attachments: attachments || [],
            fromEmail: userEmail,
            fromDisplayName: userDisplayName
        };
        setImmediate(() => {
            sendEnquiryEmail(
                mailPayload.enquiry,
                { to: mailPayload.to, cc: mailPayload.cc },
                mailPayload.attachments,
                mailPayload.fromEmail,
                mailPayload.fromDisplayName
            ).catch((err) => console.error('[notify] async sendEnquiryEmail failed:', err));
        });
    } catch (error) {
        console.error('Error in /notify:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// JSON error handler — multer and other middleware errors otherwise return HTML "Internal Server Error"
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const formatted = formatRouteError(err);
    console.error(`[express-error] ${req.method} ${req.originalUrl || req.url}:`, err);
    const status =
        err?.status ||
        err?.statusCode ||
        (err?.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    const hint =
        String(req.originalUrl || req.url || '').includes('attachments')
            ? 'Verify ENQUIRY_ATTACHMENTS_ROOT and that the PM2 service account has Modify on the UNC share.'
            : undefined;
    res.status(status).json({ ...formatted, hint });
});

process.on('unhandledRejection', (reason) => {
    console.error('[process] Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[process] Uncaught exception:', err);
});

async function startServer() {
    console.log('Starting server initialization...');
    console.log('PORT:', PORT);
    try {
        await initApp();
    } catch (err) {
        console.error('Database initialization failed:', err);
        process.exit(1);
    }

    const server = app.listen(PORT, () => {
        const procUser = (() => {
            try {
                return os.userInfo().username;
            } catch {
                return process.env.USERNAME || process.env.USER || 'unknown';
            }
        })();
        console.log(`Server running on port ${PORT}`);
        console.log(`EMS process user: ${procUser}`);
        console.log(`EMS attachments root (enquiries): ${resolveEnquiryAttachmentsBase()}`);
        console.log(`EMS attachments root (quotes): ${resolveQuoteAttachmentsBase()}`);
        console.log(`Database pool connected: ${isPoolConnected()}`);
    });
    server.keepAliveTimeout = parseInt(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || '65000', 10);
    server.headersTimeout = parseInt(process.env.HTTP_HEADERS_TIMEOUT_MS || '66000', 10);
    server.on('error', (e) => console.error('Server Error:', e));
}

startServer().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});








