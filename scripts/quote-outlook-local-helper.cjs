/**
 * EMS Outlook local helper (Windows desktop).
 * Run at user login from helpers/ folder on the PC or a network share.
 * Listens on http://127.0.0.1:39281 — opens Outlook draft with PDF via VBScript/COM.
 *
 * Resolves backend from ../backend (IIS deploy) or ../server (dev).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

function resolveBackendDir() {
    const candidates = [
        path.join(__dirname, '..', 'backend'),
        path.join(__dirname, '..', 'server'),
    ];
    for (const dir of candidates) {
        if (fs.existsSync(path.join(dir, 'lib', 'outlookDraftVbs.js'))) return dir;
    }
    throw new Error(
        'EMS backend not found. Expected ../backend or ../server next to helpers/. ' +
            'Copy the full EMS site (backend + helpers) or run from the IIS deploy folder.'
    );
}

const BACKEND_DIR = resolveBackendDir();

// Load backend/.env when present (DB + SMTP for enquiry drafts on user PC).
const envPath = path.join(BACKEND_DIR, '.env');
if (fs.existsSync(envPath)) {
    try {
        require(path.join(BACKEND_DIR, 'node_modules', 'dotenv')).config({ path: envPath });
    } catch {
        for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq < 1) continue;
            const key = trimmed.slice(0, eq).trim();
            let val = trimmed.slice(eq + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            if (!process.env[key]) process.env[key] = val;
        }
    }
}

const { buildOutlookDraftVbs, buildOutlookHtmlDraftVbs } = require(path.join(BACKEND_DIR, 'lib', 'outlookDraftVbs'));
const { resolveEnquiryOutlookEmailFields } = require(path.join(BACKEND_DIR, 'lib', 'enquiryOutlookEmailFields'));
const { buildEnquiryNotifyEmailHtml, buildEnquiryOutlookSubject } = require(path.join(BACKEND_DIR, 'lib', 'enquiryNotifyEmailHtml'));
const {
    buildCustomerAcknowledgementEmailHtml,
    buildCustomerAckSubject,
} = require(path.join(BACKEND_DIR, 'lib', 'enquiryCustomerAckEmailHtml'));
const {
    loadCustomerAckTargets,
    loadSeContact,
    resolveCustomerAckCcEmails,
} = require(path.join(BACKEND_DIR, 'lib', 'enquiryCustomerAckData'));
const { runOutlookHtmlDraftVbs } = require(path.join(BACKEND_DIR, 'lib', 'runOutlookHtmlDraftVbs'));
const { loadEnquiryEmailRow } = require(path.join(BACKEND_DIR, 'lib', 'loadEnquiryEmailRow'));
const { sql, connectDB } = require(path.join(BACKEND_DIR, 'dbConfig'));

const PORT = Number(process.env.EMS_OUTLOOK_HELPER_PORT) || 39281;
const MAX_BODY = 55 * 1024 * 1024;

function readJson(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY) {
                reject(new Error('Payload too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

function openEmlDraftOnWindows(body) {
    if (process.platform !== 'win32') {
        return Promise.reject(new Error('Windows only'));
    }
    const { emlBase64, fileName } = body || {};
    if (!emlBase64) {
        return Promise.reject(new Error('emlBase64 required'));
    }
    const dir = path.join(os.tmpdir(), 'ems-quote-eml-helper', String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });
    const emlPath = path.join(dir, String(fileName || 'EMS_QuoteDraft.eml').replace(/[/\\?%*:|"<>]/g, '_'));
    fs.writeFileSync(emlPath, Buffer.from(emlBase64, 'base64'));
    return new Promise((resolve, reject) => {
        execFile('cmd.exe', ['/c', 'start', '', emlPath], { windowsHide: true }, (err) => {
            setTimeout(() => {
                try {
                    fs.rmSync(dir, { recursive: true, force: true });
                } catch {
                    /* ignore */
                }
            }, 300000);
            if (err) reject(err);
            else resolve();
        });
    });
}

function openOutlookDraft(body) {
    if (process.platform !== 'win32') {
        return Promise.reject(new Error('Windows only'));
    }
    const { pdfBase64, attachmentName, to, cc, bcc, subject, body: mailBody, extraAttachments } = body;
    const dir = path.join(os.tmpdir(), 'ems-quote-outlook-helper', String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });

    let pdfPath = null;
    if (pdfBase64) {
        pdfPath = path.join(dir, String(attachmentName || 'EMS_QuoteDraft.pdf').replace(/[/\\?%*:|"<>]/g, '_'));
        fs.writeFileSync(pdfPath, Buffer.from(pdfBase64, 'base64'));
    }

    const extraPaths = [];
    for (const att of extraAttachments || []) {
        if (!att?.base64) continue;
        const nm = String(att.filename || 'attachment').replace(/[/\\?%*:|"<>]/g, '_');
        const p = path.join(dir, nm);
        fs.writeFileSync(p, Buffer.from(att.base64, 'base64'));
        extraPaths.push(p);
    }

    const vbsPath = path.join(dir, 'open-outlook.vbs');
    const vbs = buildOutlookDraftVbs({
        pdfPath,
        extraAttachmentPaths: extraPaths,
        to,
        cc,
        bcc,
        subject,
        body: mailBody,
        fromEmail: body.fromEmail || body.userEmail || '',
        fromDisplayName: body.fromDisplayName || body.userDisplayName || '',
    });
    fs.writeFileSync(vbsPath, vbs, 'utf8');

    return new Promise((resolve, reject) => {
        execFile('wscript.exe', ['//B', vbsPath], { windowsHide: true }, (err) => {
            setTimeout(() => {
                try {
                    fs.rmSync(dir, { recursive: true, force: true });
                } catch {
                    /* ignore */
                }
            }, 120000);
            if (err) reject(err);
            else resolve();
        });
    });
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const enquiryRoutes = new Set([
        '/enquiry-outlook-draft',
        '/enquiry-customer-ack-draft',
    ]);
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'ems-outlook-local-helper' }));
        return;
    }

    if (req.method === 'POST' && req.url === '/open-eml-draft') {
        try {
            const body = await readJson(req);
            await openEmlDraftOnWindows(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message || String(e) }));
        }
        return;
    }

    if (
        req.method !== 'POST' ||
        (req.url !== '/outlook-draft' && !enquiryRoutes.has(req.url))
    ) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
    }

    try {
        const body = await readJson(req);
        let result = { success: true };
        if (req.url === '/enquiry-outlook-draft') {
            await openEnquiryOutlookDraft(body);
        } else if (req.url === '/enquiry-customer-ack-draft') {
            result = { success: true, ...(await openEnquiryCustomerAckDraft(body)) };
        } else {
            await openOutlookDraft(body);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || String(e) }));
    }
});

async function openEnquiryOutlookDraft(body) {
    const { requestNo, concernedSEs } = body || {};
    const reqNo = String(requestNo || '').trim();
    if (!reqNo) {
        throw new Error('requestNo is required');
    }
    const seNamesFromBody = Array.isArray(concernedSEs)
        ? concernedSEs
        : typeof concernedSEs === 'string'
          ? concernedSEs.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
    await connectDB();
    const row = await loadEnquiryEmailRow(reqNo);
    if (!row) throw new Error('Enquiry not found');
    const attRes = await sql.query`SELECT ID, FileName FROM Attachments WHERE RequestNo = ${reqNo} ORDER BY ID`;
    const port = Number(process.env.PORT || 5002);
    const apiBase = `http://127.0.0.1:${port}`;
    const attachments = (attRes.recordset || []).map((att) => ({
        ID: att.ID,
        FileName: att.FileName,
        downloadUrl: `${apiBase}/api/attachments/${att.ID}`,
    }));
    const { to, cc, seNames } = await resolveEnquiryOutlookEmailFields(reqNo, {
        concernedSEs: seNamesFromBody,
    });
    if (!to) throw new Error(`No email for SE(s): ${(seNames || []).join(', ') || 'none'}`);
    const html = buildEnquiryNotifyEmailHtml(row, attachments, apiBase);
    const subject = buildEnquiryOutlookSubject(row);
    const dir = path.join(os.tmpdir(), 'ems-enquiry-outlook-helper', String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });
    const htmlPath = path.join(dir, 'enquiry-email.html');
    fs.writeFileSync(htmlPath, '\uFEFF' + html, 'utf8');
    const vbsPath = path.join(dir, 'open-outlook.vbs');
    fs.writeFileSync(
        vbsPath,
        buildOutlookHtmlDraftVbs({ htmlPath, to, cc, subject, attachmentPaths: [], send: true }),
        'utf8'
    );
    await new Promise((resolve, reject) => {
        execFile('wscript.exe', ['//B', vbsPath], { windowsHide: true }, (err) => {
            setTimeout(() => {
                try {
                    fs.rmSync(dir, { recursive: true, force: true });
                } catch {
                    /* ignore */
                }
            }, 120000);
            if (err) reject(err);
            else resolve();
        });
    });
}

async function openEnquiryCustomerAckDraft(body) {
    const {
        requestNo,
        acknowledgementSE,
        createdByEmail,
        concernedSEs,
        customerAckTargets,
    } = body || {};
    const reqNo = String(requestNo || '').trim();
    const seName = String(acknowledgementSE || '').trim();
    if (!reqNo) throw new Error('requestNo is required');
    if (!seName) throw new Error('acknowledgementSE is required');

    await connectDB();
    const row = await loadEnquiryEmailRow(reqNo);
    if (!row) throw new Error('Enquiry not found');

    const targets = await loadCustomerAckTargets(reqNo, customerAckTargets);
    if (!targets.length) {
        throw new Error(
            'No customer email found. Each customer must have a Received From contact with an email in master data.'
        );
    }

    const seContact = await loadSeContact(seName);
    const replyTo = seContact.email || String(createdByEmail || '').trim().toLowerCase();
    const replyToName = seContact.fullName || seName;
    const { cc } = await resolveCustomerAckCcEmails(reqNo, { concernedSEs });
    const subject = buildCustomerAckSubject(row);
    const opened = [];

    for (const target of targets) {
        const toNorm = String(target.email || '')
            .trim()
            .toLowerCase();
        const ccForDraft = String(cc || '')
            .split(';')
            .map((e) => e.trim())
            .filter((e) => e && e.toLowerCase() !== toNorm)
            .join('; ');
        const html = buildCustomerAcknowledgementEmailHtml(row, seContact);
        await runOutlookHtmlDraftVbs({
            html,
            to: target.email,
            cc: ccForDraft,
            subject,
            replyTo: replyTo || undefined,
            replyToName: replyTo ? replyToName : undefined,
            send: false,
            windowsHide: false,
            useDefaultSignature: true,
            tmpSubdir: 'ems-enquiry-customer-ack-helper',
        });
        opened.push({ customerName: target.customerName, to: target.email });
    }

    return { draftCount: opened.length, drafts: opened, replyTo: replyTo || null };
}

server.listen(PORT, '127.0.0.1', () => {
    console.log(
        `[EMS] Outlook helper on http://127.0.0.1:${PORT} (quote: /outlook-draft, enquiry notify: /enquiry-outlook-draft, customer ack: /enquiry-customer-ack-draft)`
    );
});
