/**
 * Enquiry acknowledgement — Outlook draft (VBScript) for new enquiries.
 */
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { sql } = require('../dbConfig');
const { buildOutlookHtmlDraftVbs } = require('../lib/outlookDraftVbs');
const { resolveEnquiryOutlookEmailFields } = require('../lib/enquiryOutlookEmailFields');
const { buildEnquiryNotifyEmailHtml, buildEnquiryOutlookSubject } = require('../lib/enquiryNotifyEmailHtml');
const {
    buildCustomerAcknowledgementEmailHtml,
    buildCustomerAckSubject,
} = require('../lib/enquiryCustomerAckEmailHtml');
const {
    loadCustomerAckTargets,
    loadSeContact,
    resolveCustomerAckCcEmails,
    normalizeEmail,
} = require('../lib/enquiryCustomerAckData');
const { loadEnquiryEmailRow } = require('../lib/loadEnquiryEmailRow');
const { runOutlookHtmlDraftVbs } = require('../lib/runOutlookHtmlDraftVbs');
const { sendEnquiryNotificationViaSmtp } = require('../lib/enquiryNotifySmtp');

const router = express.Router();

function useSmtpForEnquiryNotify() {
    return String(process.env.EMS_ENQUIRY_NOTIFY_VIA_SMTP || '').trim() === '1';
}

function smtpFallbackEnabled() {
    const v = String(process.env.EMS_ENQUIRY_NOTIFY_SMTP_FALLBACK || '1').trim();
    return v !== '0' && v.toLowerCase() !== 'false';
}

async function runOutlookInternalSend({ htmlPath, vbsPath, dir, to, cc, subject }) {
    const vbs = buildOutlookHtmlDraftVbs({
        htmlPath,
        to,
        cc,
        subject,
        attachmentPaths: [],
        send: true,
    });
    fs.writeFileSync(vbsPath, vbs, 'utf8');

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

function getApiPublicBase(req) {
    const fromEnv = process.env.EMS_PUBLIC_API_URL || process.env.QUOTE_PDF_ASSET_ORIGIN || '';
    if (fromEnv) return String(fromEnv).replace(/\/$/, '');
    const host = req.get('host') || `127.0.0.1:${process.env.PORT || 5002}`;
    const proto = req.protocol || 'http';
    return `${proto}://${host}`;
}

async function loadPublicAttachments(requestNo, apiBase) {
    const attRes = await sql.query`
        SELECT ID, FileName FROM Attachments
        WHERE RequestNo = ${requestNo}
          AND (Visibility IS NULL OR Visibility = 'Public' OR Visibility = '')
        ORDER BY ID
    `;
    const base = String(apiBase || '').replace(/\/$/, '');
    return (attRes.recordset || []).map((att) => ({
        ID: att.ID,
        FileName: att.FileName,
        downloadUrl: base ? `${base}/api/attachments/${att.ID}` : `/api/attachments/${att.ID}`,
    }));
}

/** GET /api/enquiries/outlook-email-fields?requestNo= */
router.get('/outlook-email-fields', async (req, res) => {
    try {
        const requestNo = String(req.query.requestNo || '').trim();
        const fields = await resolveEnquiryOutlookEmailFields(requestNo);
        return res.json(fields);
    } catch (err) {
        console.error('[enquiry-outlook] outlook-email-fields:', err);
        return res.status(500).json({ to: '', cc: '', ccList: [], toList: [] });
    }
});

/** POST /api/enquiries/outlook-draft — send enquiry notification via Outlook (no draft window). */
router.post('/outlook-draft', express.json({ limit: '5mb' }), async (req, res) => {
    if (process.platform !== 'win32') {
        return res.status(501).json({ error: 'Outlook send is supported on Windows only' });
    }

    try {
        const { requestNo, concernedSEs, userEmail, userDisplayName } = req.body || {};
        const reqNo = String(requestNo || '').trim();
        if (!reqNo) {
            return res.status(400).json({ error: 'requestNo is required' });
        }

        const row = await loadEnquiryEmailRow(reqNo);
        if (!row) {
            return res.status(404).json({ error: 'Enquiry not found' });
        }

        const seNamesFromBody = Array.isArray(concernedSEs)
            ? concernedSEs
            : typeof concernedSEs === 'string'
              ? concernedSEs.split(',').map((s) => s.trim()).filter(Boolean)
              : [];

        const apiBase = getApiPublicBase(req);
        const attachments = await loadPublicAttachments(reqNo, apiBase);
        const { to, cc, seNames } = await resolveEnquiryOutlookEmailFields(reqNo, {
            concernedSEs: seNamesFromBody,
        });
        if (!to) {
            const label = (seNames || []).join(', ') || 'selected SEs';
            return res.status(400).json({
                error: 'se_email_not_found',
                message: `No email found in Master_ConcernedSE for: ${label}.`,
            });
        }

        const html = buildEnquiryNotifyEmailHtml(row, attachments, apiBase);
        const subject = buildEnquiryOutlookSubject(row);

        if (useSmtpForEnquiryNotify()) {
            await sendEnquiryNotificationViaSmtp({ to, cc, subject, html, fromEmail: userEmail, fromDisplayName: userDisplayName });
            return res.json({ success: true, sent: true, via: 'smtp', to, cc, subject });
        }

        const dir = path.join(os.tmpdir(), 'ems-enquiry-outlook', String(Date.now()));
        fs.mkdirSync(dir, { recursive: true });
        const htmlPath = path.join(dir, 'enquiry-email.html');
        fs.writeFileSync(htmlPath, '\uFEFF' + html, 'utf8');
        const vbsPath = path.join(dir, 'open-outlook.vbs');

        try {
            await runOutlookInternalSend({ htmlPath, vbsPath, dir, to, cc, subject });
            return res.json({ success: true, sent: true, via: 'outlook', to, cc, subject });
        } catch (outlookErr) {
            if (!smtpFallbackEnabled()) throw outlookErr;
            console.warn('[enquiry-outlook] Outlook send failed, trying SMTP fallback:', outlookErr.message);
            try {
                await sendEnquiryNotificationViaSmtp({ to, cc, subject, html, fromEmail: userEmail, fromDisplayName: userDisplayName });
                return res.json({
                    success: true,
                    sent: true,
                    via: 'smtp-fallback',
                    to,
                    cc,
                    subject,
                    outlookError: outlookErr.message || String(outlookErr),
                });
            } catch (smtpErr) {
                console.error('[enquiry-outlook] SMTP fallback failed:', smtpErr);
                return res.status(500).json({
                    error: 'notify_send_failed',
                    message: `Outlook: ${outlookErr.message || outlookErr}. SMTP: ${smtpErr.message || smtpErr}.`,
                    outlookError: outlookErr.message || String(outlookErr),
                    smtpError: smtpErr.message || String(smtpErr),
                });
            }
        }
    } catch (err) {
        console.error('[enquiry-outlook] outlook-send:', err);
        return res.status(500).json({
            error: 'outlook_send_failed',
            message: err.message || String(err),
        });
    }
});

/** POST /api/enquiries/outlook-customer-ack-draft — one Outlook draft per customer (Display only). */
const customerAckHandler = async (req, res) => {
    const isSmtpMode = useSmtpForEnquiryNotify();
    if (process.platform !== 'win32' && !isSmtpMode) {
        return res.status(501).json({ error: 'Outlook draft is supported on Windows only' });
    }

    try {
        const {
            requestNo,
            acknowledgementSE,
            createdByEmail,
            concernedSEs,
            customerAckTargets,
        } = req.body || {};
        const reqNo = String(requestNo || '').trim();
        const seName = String(acknowledgementSE || '').trim();
        if (!reqNo) {
            return res.status(400).json({ error: 'requestNo is required' });
        }
        if (!seName) {
            return res.status(400).json({ error: 'acknowledgementSE is required' });
        }

        const row = await loadEnquiryEmailRow(reqNo);
        if (!row) {
            return res.status(404).json({ error: 'Enquiry not found' });
        }

        const targets = await loadCustomerAckTargets(reqNo, customerAckTargets);
        if (!targets.length) {
            return res.status(400).json({
                error: 'customer_email_not_found',
                message:
                    'No customer email found. Each customer must have a Received From contact with an email in master data.',
            });
        }

        const seContact = await loadSeContact(seName);
        const replyTo = seContact.email || normalizeEmail(createdByEmail);
        const replyToName = seContact.fullName || seName;
        const { cc } = await resolveCustomerAckCcEmails(reqNo, { concernedSEs });
        const subject = buildCustomerAckSubject(row);
        
        const opened = [];
        const sentSmtp = [];

        for (const target of targets) {
            const toNorm = normalizeEmail(target.email);
            const ccForDraft = String(cc || '')
                .split(';')
                .map((e) => e.trim())
                .filter((e) => e && normalizeEmail(e) !== toNorm)
                .join('; ');
            const html = buildCustomerAcknowledgementEmailHtml(row, seContact);

            if (isSmtpMode) {
                // Global fix: Send directly via SMTP instead of attempting Outlook VBS
                await sendEnquiryNotificationViaSmtp({
                    to: target.email,
                    cc: ccForDraft,
                    subject,
                    html,
                    replyTo
                });
                sentSmtp.push({
                    customerName: target.customerName,
                    to: target.email,
                    contactName: target.contactName,
                    companyName: target.companyName,
                });
            } else {
                try {
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
                        tmpSubdir: 'ems-enquiry-customer-ack',
                    });
                    opened.push({
                        customerName: target.customerName,
                        to: target.email,
                        contactName: target.contactName,
                        companyName: target.companyName,
                    });
                } catch (outlookErr) {
                    if (smtpFallbackEnabled()) {
                        console.warn('[enquiry-outlook] customer ack draft failed, trying SMTP fallback:', outlookErr.message);
                        await sendEnquiryNotificationViaSmtp({
                            to: target.email,
                            cc: ccForDraft,
                            subject,
                            html,
                            replyTo
                        });
                        sentSmtp.push({
                            customerName: target.customerName,
                            to: target.email,
                            contactName: target.contactName,
                            companyName: target.companyName,
                            fallbackUsed: true
                        });
                    } else {
                        throw outlookErr;
                    }
                }
            }
        }

        if (isSmtpMode || sentSmtp.length > 0) {
            return res.json({
                success: true,
                sent: true,
                via: isSmtpMode ? 'smtp' : 'smtp-fallback',
                draftCount: 0,
                sentCount: sentSmtp.length,
                drafts: [],
                cc,
                subject,
                representative: seContact.fullName,
            });
        }

        return res.json({
            success: true,
            draft: true,
            draftCount: opened.length,
            drafts: opened,
            cc,
            subject,
            representative: seContact.fullName,
        });
    } catch (err) {
        console.error('[enquiry-outlook] customer-ack-draft:', err);
        return res.status(500).json({
            error: 'outlook_customer_ack_failed',
            message: err.message || String(err),
        });
    }
};

router.post('/outlook-customer-ack-draft', express.json({ limit: '5mb' }), customerAckHandler);
router.post('/outlook_customer_ack_draft', express.json({ limit: '5mb' }), customerAckHandler);


module.exports = router;
