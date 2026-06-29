'use strict';

const { sql } = require('../dbConfig');
const { loadEnquiryEmailRow } = require('./loadEnquiryEmailRow');
const { resolveEnquiryOutlookEmailFields } = require('./enquiryOutlookEmailFields');
const { isExcludedNotificationEmail } = require('./notificationEmailExclusions');
const { sendEnquiryNotificationViaSmtp } = require('./enquiryNotifySmtp');
const { formatEnquiryDate, formatShortDate, FONT_FAMILY } = require('./enquiryNotifyEmailHtml');
const { tomorrowYmdInSchedulerTz } = require('./schedulerTime');
const { getSmtpFromEmail } = require('./smtpTransport');

function dueSubmissionReminderFromEmail() {
    return String(process.env.EMS_DUE_SUBMISSION_REMINDER_FROM || getSmtpFromEmail()).trim();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function displayCustomerName(row) {
    if (Array.isArray(row.CustomerNamesList) && row.CustomerNamesList.length) {
        return row.CustomerNamesList.join(', ');
    }
    const raw = String(row.CustomerNameDisplay || row.CustomerName || '').trim();
    return raw.replace(/^\d{2}\.\s*/g, '').trim();
}

function displayConsultantName(row) {
    if (Array.isArray(row.ConsultantNamesList) && row.ConsultantNamesList.length) {
        return row.ConsultantNamesList.join(', ');
    }
    return String(row.ConsultantName || '').trim();
}

function buildDueSubmissionReminderSubject(dueYmd) {
    const parts = String(dueYmd || '').split('-').map(Number);
    const dt = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : null;
    const dueLabel = dt && !Number.isNaN(dt.getTime()) ? formatShortDate(dt) : dueYmd;
    return `Tender/Quote Submission due on ${dueLabel}`;
}

function buildDueEnquiryListTableHtml(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return '';

    const thStyle = [
        'padding:6px 8px',
        'background-color:#d9d9d9',
        'color:#000000',
        'font-family:' + FONT_FAMILY,
        'font-size:10pt',
        'font-weight:600',
        'text-align:center',
        'border:1px solid #000000',
        'vertical-align:middle',
    ].join(';');

    const tdStyle = [
        'padding:5px 8px',
        'font-family:' + FONT_FAMILY,
        'font-size:10pt',
        'color:#000000',
        'border:1px solid #000000',
        'vertical-align:top',
    ].join(';');

    const headers = [
        'Sl. No.',
        'Enquiry No',
        'Enquiry Date',
        'Project Name',
        'Customer Name',
        'Client Name',
        'Consultant Name',
        'Due Date',
        'Enquiry Details',
    ];

    const headRow = headers.map((h) => `<th style="${thStyle}">${escapeHtml(h)}</th>`).join('');
    const bodyRows = list
        .map((row, idx) => {
            const cells = [
                String(idx + 1),
                row.requestNo,
                row.enquiryDate,
                row.projectName,
                row.customerName,
                row.clientName,
                row.consultantName,
                row.dueDate,
                row.enquiryDetails,
            ];
            return `<tr>${cells
                .map((c) => `<td style="${tdStyle}">${escapeHtml(c)}</td>`)
                .join('')}</tr>`;
        })
        .join('\n');

    return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="border-collapse:collapse;width:100%;max-width:100%;font-family:${FONT_FAMILY};mso-table-lspace:0pt;mso-table-rspace:0pt;">
<thead><tr>${headRow}</tr></thead>
<tbody>
${bodyRows}
</tbody>
</table>`;
}

function buildDueSubmissionReminderEmailHtml(dueYmd, enquiryRows) {
    const parts = String(dueYmd || '').split('-').map(Number);
    const dt = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : null;
    const dueLabel = dt && !Number.isNaN(dt.getTime()) ? formatShortDate(dt) : dueYmd;
    const tableHtml = buildDueEnquiryListTableHtml(enquiryRows);

    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
</head>
<body style="margin:0;padding:14px;font-family:${FONT_FAMILY};font-size:11pt;color:#1e293b;background:#ffffff;">
<p style="margin:0 0 12px 0;font-size:10pt;font-family:${FONT_FAMILY};color:#64748b;"><i>* This is an auto generated E-mail from Enquiry Management System * Please do not reply *</i></p>
<p style="margin:0 0 10px 0;font-family:${FONT_FAMILY};">Dear Sir / Madam,</p>
<p style="margin:0 0 14px 0;line-height:1.45;font-family:${FONT_FAMILY};">Tender/Quote Submission:- Due on <b>${escapeHtml(dueLabel)}</b>. This is for your notification.</p>
${tableHtml}
</body>
</html>`;
}

async function ensureDueSubmissionReminderLogTable() {
    await sql.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DueSubmissionReminderLog' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE dbo.DueSubmissionReminderLog (
                ID INT IDENTITY(1, 1) PRIMARY KEY,
                RecipientEmail NVARCHAR(320) NOT NULL,
                DueDate DATE NOT NULL,
                SentAt DATETIME NOT NULL DEFAULT GETDATE(),
                CONSTRAINT UQ_DueSubmissionReminderLog UNIQUE (RecipientEmail, DueDate)
            );
        END
        ELSE IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('dbo.DueSubmissionReminderLog') AND name = 'RecipientEmail'
        )
        BEGIN
            ALTER TABLE dbo.DueSubmissionReminderLog ADD RecipientEmail NVARCHAR(320) NULL;
        END
    `);
}

async function fetchDueEnquiriesOn(dueYmd) {
    const res = await sql.query`
        SELECT em.RequestNo
        FROM EnquiryMaster em
        WHERE em.DueDate IS NOT NULL
          AND CONVERT(VARCHAR(10), em.DueDate, 23) = ${dueYmd}
          AND NOT EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo)
        ORDER BY em.RequestNo
    `;
    return (res.recordset || []).map((r) => String(r.RequestNo || '').trim()).filter(Boolean);
}

function mapRowToListEntry(row) {
    return {
        requestNo: String(row.RequestNo || '').trim(),
        enquiryDate: formatEnquiryDate(row.EnquiryDate),
        projectName: String(row.ProjectName || '').trim(),
        customerName: displayCustomerName(row),
        clientName: String(row.ClientName || '').trim(),
        consultantName: displayConsultantName(row),
        dueDate: formatShortDate(row.DueDate),
        enquiryDetails: String(row.EnquiryDetails || '').trim(),
    };
}

function addEnquiryToBundle(bundles, recipientEmail, listEntry) {
    const key = String(recipientEmail || '').trim().toLowerCase();
    if (!key || isExcludedNotificationEmail(key)) return;
    if (!bundles.has(key)) {
        bundles.set(key, { toEmail: key, enquiries: [] });
    }
    const bundle = bundles.get(key);
    if (!bundle.enquiries.some((e) => e.requestNo === listEntry.requestNo)) {
        bundle.enquiries.push(listEntry);
    }
}

/**
 * Build one bundle per recipient:
 * - SEs: all enquiries due tomorrow where they are assigned
 * - CCMailIds users: all enquiries due tomorrow in their CC scope
 */
async function buildRecipientBundles(dueYmd) {
    const requestNos = await fetchDueEnquiriesOn(dueYmd);
    const bundles = new Map();

    for (const requestNo of requestNos) {
        const row = await loadEnquiryEmailRow(requestNo);
        if (!row) continue;

        const { toList, ccList } = await resolveEnquiryOutlookEmailFields(requestNo);
        if (!toList?.length && !ccList?.length) {
            console.warn(`[due-submission-reminder] No recipients for enquiry ${requestNo} — skipped.`);
            continue;
        }

        const listEntry = mapRowToListEntry(row);
        for (const seEmail of toList || []) {
            addEnquiryToBundle(bundles, seEmail, listEntry);
        }
        for (const ccEmail of ccList || []) {
            addEnquiryToBundle(bundles, ccEmail, listEntry);
        }
    }

    for (const bundle of bundles.values()) {
        bundle.enquiries.sort((a, b) =>
            a.requestNo.localeCompare(b.requestNo, undefined, { numeric: true }),
        );
    }

    return bundles;
}

async function wasDueSubmissionReminderSent(recipientEmail, dueYmd) {
    const res = await sql.query`
        SELECT TOP 1 1 AS sent
        FROM DueSubmissionReminderLog
        WHERE LOWER(LTRIM(RTRIM(RecipientEmail))) = ${recipientEmail}
          AND CONVERT(VARCHAR(10), DueDate, 23) = ${dueYmd}
    `;
    return (res.recordset || []).length > 0;
}

async function markDueSubmissionReminderSent(recipientEmail, dueYmd) {
    await sql.query`
        INSERT INTO DueSubmissionReminderLog (RecipientEmail, DueDate)
        VALUES (${recipientEmail}, ${dueYmd})
    `;
}

async function sendDueSubmissionReminderToRecipient(bundle, dueYmd) {
    if (!bundle?.enquiries?.length) {
        return { sent: false, reason: 'empty' };
    }

    const subject = buildDueSubmissionReminderSubject(dueYmd);
    const html = buildDueSubmissionReminderEmailHtml(dueYmd, bundle.enquiries);

    await sendEnquiryNotificationViaSmtp({
        fromEmail: dueSubmissionReminderFromEmail(),
        to: bundle.toEmail,
        cc: '',
        subject,
        html,
    });

    await markDueSubmissionReminderSent(bundle.toEmail, dueYmd);
    console.log(
        `[due-submission-reminder] Sent to ${bundle.toEmail} (${bundle.enquiries.length} enquiry row(s), due ${dueYmd})`,
    );
    return { sent: true, to: bundle.toEmail, count: bundle.enquiries.length };
}

/**
 * Quote/tender submission reminders — enquiries due tomorrow with no quote yet.
 * One email per SE / CCMailIds user with a table of all their due enquiries (no Cc).
 * @param {{ dueYmd?: string, force?: boolean }} [options]
 */
async function runDueSubmissionReminders(options = {}) {
    await ensureDueSubmissionReminderLogTable();

    const dueYmd = String(options.dueYmd || tomorrowYmdInSchedulerTz()).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueYmd)) {
        throw new Error(`Invalid dueYmd: ${dueYmd}`);
    }

    const bundles = await buildRecipientBundles(dueYmd);
    console.log(
        `[due-submission-reminder] Run for due date ${dueYmd} — ${bundles.size} recipient(s).`,
    );

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const bundle of bundles.values()) {
        try {
            if (!options.force && (await wasDueSubmissionReminderSent(bundle.toEmail, dueYmd))) {
                skipped += 1;
                continue;
            }
            const result = await sendDueSubmissionReminderToRecipient(bundle, dueYmd);
            if (result.sent) sent += 1;
            else skipped += 1;
        } catch (err) {
            failed += 1;
            console.error(`[due-submission-reminder] Failed for ${bundle.toEmail}:`, err.message);
        }
    }

    console.log(
        `[due-submission-reminder] Done — sent: ${sent}, skipped: ${skipped}, failed: ${failed}.`,
    );
    return { dueYmd, recipients: bundles.size, sent, skipped, failed };
}

module.exports = {
    runDueSubmissionReminders,
    buildDueSubmissionReminderSubject,
    buildDueSubmissionReminderEmailHtml,
    buildDueEnquiryListTableHtml,
};
