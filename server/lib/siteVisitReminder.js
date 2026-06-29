'use strict';

const { sql } = require('../dbConfig');
const { loadEnquiryEmailRow } = require('./loadEnquiryEmailRow');
const { resolveEnquiryReminderRecipients } = require('./enquiryOutlookEmailFields');
const { sendEnquiryNotificationViaSmtp } = require('./enquiryNotifySmtp');
const {
    buildEnquiryDetailsTableHtml,
    formatShortDate,
    FONT_FAMILY,
    PISTACHIO,
    PISTACHIO_BORDER,
} = require('./enquiryNotifyEmailHtml');
const { tomorrowYmdInSchedulerTz, getSchedulerTimeZone } = require('./schedulerTime');
const { getSmtpFromEmail } = require('./smtpTransport');

function siteVisitReminderFromEmail() {
    return String(process.env.EMS_SITE_VISIT_REMINDER_FROM || getSmtpFromEmail()).trim();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getApiPublicBase() {
    const fromEnv = process.env.EMS_PUBLIC_API_URL || process.env.QUOTE_PDF_ASSET_ORIGIN || '';
    if (fromEnv) return String(fromEnv).replace(/\/$/, '');
    const port = process.env.PORT || 5002;
    return `http://127.0.0.1:${port}`;
}

async function ensureReminderLogTable() {
    await sql.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SiteVisitReminderLog' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE dbo.SiteVisitReminderLog (
                ID INT IDENTITY(1, 1) PRIMARY KEY,
                RequestNo NVARCHAR(50) NOT NULL,
                SiteVisitDate DATE NOT NULL,
                SentAt DATETIME NOT NULL DEFAULT GETDATE(),
                CONSTRAINT UQ_SiteVisitReminderLog UNIQUE (RequestNo, SiteVisitDate)
            );
        END
    `);
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
        downloadUrl: base && att.ID ? `${base}/api/attachments/${att.ID}` : `/api/attachments/${att.ID}`,
    }));
}

async function wasReminderAlreadySent(requestNo, siteVisitYmd) {
    const res = await sql.query`
        SELECT TOP 1 1 AS sent
        FROM SiteVisitReminderLog
        WHERE RequestNo = ${requestNo}
          AND CONVERT(VARCHAR(10), SiteVisitDate, 23) = ${siteVisitYmd}
    `;
    return (res.recordset || []).length > 0;
}

async function markReminderSent(requestNo, siteVisitYmd) {
    await sql.query`
        INSERT INTO SiteVisitReminderLog (RequestNo, SiteVisitDate)
        VALUES (${requestNo}, ${siteVisitYmd})
    `;
}

function buildSiteVisitReminderSubject(row) {
    const visitDate = formatShortDate(row.SiteVisitDate);
    const reqNo = String(row.RequestNo || '').trim();
    const project = String(row.ProjectName || '').trim();
    return `Reminder for Site visit on ${visitDate}; Enquiry No.: ${reqNo}; Project: ${project}`;
}

function buildSiteVisitReminderEmailHtml(row, attachments, apiPublicBase) {
    const visitDate = formatShortDate(row.SiteVisitDate);
    const tableHtml = buildEnquiryDetailsTableHtml(row, attachments, apiPublicBase, {
        labelBackground: PISTACHIO,
        labelColor: '#1e293b',
        labelBorderColor: PISTACHIO_BORDER,
    });

    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
</head>
<body style="margin:0;padding:14px;font-family:${FONT_FAMILY};font-size:11pt;color:#1e293b;background:#ffffff;">
<p style="margin:0 0 14px 0;line-height:1.45;font-family:${FONT_FAMILY};">You are scheduled for a site visit on <b>${escapeHtml(visitDate)}</b>.</p>
<p style="margin:0 0 14px 0;line-height:1.45;font-family:${FONT_FAMILY};">Please verify your site access permits / Gate passes and ensure your tools/documents/configs are ready, and coordinate with the site contact.</p>
<p style="margin:0 0 8px 0;font-weight:600;font-family:${FONT_FAMILY};">Enquiry Details:</p>
${tableHtml}
<p style="margin:14px 0 6px 0;font-family:${FONT_FAMILY};font-size:11pt;line-height:1.4;">&nbsp;</p>
<p style="margin:0;font-size:10pt;font-family:${FONT_FAMILY};color:#64748b;"><i>* This is an Auto Generated E-mail by Enquiry Management System *</i></p>
</body>
</html>`;
}

async function fetchEnquiriesWithSiteVisitOn(visitYmd) {
    const res = await sql.query`
        SELECT RequestNo
        FROM EnquiryMaster
        WHERE SiteVisitDate IS NOT NULL
          AND CONVERT(VARCHAR(10), SiteVisitDate, 23) = ${visitYmd}
        ORDER BY RequestNo
    `;
    return (res.recordset || []).map((r) => String(r.RequestNo || '').trim()).filter(Boolean);
}

async function sendSiteVisitReminderForEnquiry(requestNo, visitYmd, apiBase) {
    const row = await loadEnquiryEmailRow(requestNo);
    if (!row) {
        console.warn(`[site-visit-reminder] Enquiry ${requestNo} not found — skipped.`);
        return { sent: false, reason: 'not_found' };
    }

    const { to, toList } = await resolveEnquiryReminderRecipients(requestNo);
    if (!toList?.length) {
        console.warn(`[site-visit-reminder] No To recipients for enquiry ${requestNo} — skipped.`);
        return { sent: false, reason: 'no_recipients' };
    }

    const attachments = await loadPublicAttachments(requestNo, apiBase);
    const subject = buildSiteVisitReminderSubject(row);
    const html = buildSiteVisitReminderEmailHtml(row, attachments, apiBase);

    await sendEnquiryNotificationViaSmtp({
        fromEmail: siteVisitReminderFromEmail(),
        to,
        cc: '',
        subject,
        html,
    });

    await markReminderSent(requestNo, visitYmd);
    console.log(`[site-visit-reminder] Sent for enquiry ${requestNo} (visit ${visitYmd}) → ${to}`);
    return { sent: true, to };
}

/**
 * Send site-visit reminders for enquiries whose SiteVisitDate is tomorrow (scheduler timezone).
 * @param {{ visitYmd?: string, force?: boolean }} [options]
 */
async function runSiteVisitReminders(options = {}) {
    await ensureReminderLogTable();

    const visitYmd = String(options.visitYmd || tomorrowYmdInSchedulerTz()).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(visitYmd)) {
        throw new Error(`Invalid visitYmd: ${visitYmd}`);
    }

    const apiBase = getApiPublicBase();
    const requestNos = await fetchEnquiriesWithSiteVisitOn(visitYmd);
    console.log(
        `[site-visit-reminder] Run for visit date ${visitYmd} — ${requestNos.length} enquiry(ies).`,
    );

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const requestNo of requestNos) {
        try {
            if (!options.force && (await wasReminderAlreadySent(requestNo, visitYmd))) {
                skipped += 1;
                continue;
            }
            const result = await sendSiteVisitReminderForEnquiry(requestNo, visitYmd, apiBase);
            if (result.sent) sent += 1;
            else skipped += 1;
        } catch (err) {
            failed += 1;
            console.error(`[site-visit-reminder] Failed for enquiry ${requestNo}:`, err.message);
        }
    }

    console.log(
        `[site-visit-reminder] Done — sent: ${sent}, skipped: ${skipped}, failed: ${failed}.`,
    );
    return { visitYmd, total: requestNos.length, sent, skipped, failed };
}

module.exports = {
    runSiteVisitReminders,
    buildSiteVisitReminderSubject,
    buildSiteVisitReminderEmailHtml,
    tomorrowYmdInSchedulerTz,
    getSchedulerTimeZone,
};
