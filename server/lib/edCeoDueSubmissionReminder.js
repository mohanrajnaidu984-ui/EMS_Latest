'use strict';

const { sql } = require('../dbConfig');
const { loadEnquiryEmailRow } = require('./loadEnquiryEmailRow');
const { sendEnquiryNotificationViaSmtp, splitRecipients } = require('./enquiryNotifySmtp');
const { formatEnquiryDate, formatShortDate, FONT_FAMILY } = require('./enquiryNotifyEmailHtml');
const { todayYmdInSchedulerTz, addWorkingDaysToYmd, isWorkingDayYmd } = require('./schedulerTime');
const { getSmtpFromEmail } = require('./smtpTransport');

const REMINDER_KIND_TWO_WORKING = '2working';
const REMINDER_KIND_TODAY = 'today';

function edCeoReminderFromEmail() {
    return String(process.env.EMS_ED_CEO_DUE_REMINDER_FROM || getSmtpFromEmail() || 'ems@almoayyedcg.com').trim();
}

const DEFAULT_ED_CEO_REMINDER_TO =
    'hala@almoayyedcg.com,mathews@almoayyedcg.com,lohidas@almoayyedcg.com,biju@almoayyedcg.com,mohanan.pillai@almoayyedcg.com,mepgm@almoayyedcg.com';
const DEFAULT_ED_CEO_REMINDER_BCC = 'mohan.naidu@almoayyedcg.com';

function edCeoReminderToEmails() {
    const raw = String(process.env.EMS_ED_CEO_DUE_REMINDER_TO || DEFAULT_ED_CEO_REMINDER_TO).trim();
    return splitRecipients(raw).map((e) => e.toLowerCase());
}

function edCeoReminderBccEmails() {
    const raw = String(process.env.EMS_ED_CEO_DUE_REMINDER_BCC || DEFAULT_ED_CEO_REMINDER_BCC).trim();
    return splitRecipients(raw).map((e) => e.toLowerCase());
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

function formatDueLabel(dueYmd) {
    const parts = String(dueYmd || '').split('-').map(Number);
    const dt = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : null;
    return dt && !Number.isNaN(dt.getTime()) ? formatShortDate(dt) : dueYmd;
}

function buildEdCeoReminderSubject(kind, dueYmd) {
    const dueLabel = formatDueLabel(dueYmd);
    if (kind === REMINDER_KIND_TODAY) {
        return `Tender/Quote Submission due on Today ${dueLabel}`;
    }
    return `Tender/Quote Submission due on ${dueLabel} - 2 working`;
}

function buildEdCeoEnquiryListTableHtml(rows) {
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
        'Division',
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
                row.division,
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

function buildEdCeoReminderEmailHtml(kind, dueYmd, enquiryRows) {
    const dueLabel = formatDueLabel(dueYmd);
    const tableHtml = buildEdCeoEnquiryListTableHtml(enquiryRows);
    const intro =
        kind === REMINDER_KIND_TODAY
            ? `Tender/Quote Submission:- Due on <b>Today ${escapeHtml(dueLabel)}</b>. This is for your notification.`
            : `Tender/Quote Submission:- Due on <b>${escapeHtml(dueLabel)}</b>. This is for your notification.`;

    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
</head>
<body style="margin:0;padding:14px;font-family:${FONT_FAMILY};font-size:11pt;color:#1e293b;background:#ffffff;">
<p style="margin:0 0 12px 0;font-size:10pt;font-family:${FONT_FAMILY};color:#64748b;"><i>* This is an auto generated E-mail from Enquiry Management System * Please do not reply *</i></p>
<p style="margin:0 0 10px 0;font-family:${FONT_FAMILY};">Dear Sir / Madam,</p>
<p style="margin:0 0 14px 0;line-height:1.45;font-family:${FONT_FAMILY};">${intro}</p>
${tableHtml}
</body>
</html>`;
}

function isSqlUniqueViolation(err) {
    const n = err?.number ?? err?.originalError?.number;
    return n === 2627 || n === 2601;
}

async function ensureEdCeoDueSubmissionReminderLogTable() {
    await sql.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EdCeoDueSubmissionReminderLog' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE dbo.EdCeoDueSubmissionReminderLog (
                ID INT IDENTITY(1, 1) PRIMARY KEY,
                ReminderKind NVARCHAR(32) NOT NULL,
                DueDate DATE NOT NULL,
                SentAt DATETIME NOT NULL DEFAULT GETDATE(),
                CONSTRAINT UQ_EdCeoDueSubmissionReminderLog UNIQUE (ReminderKind, DueDate)
            );
        END
        IF NOT EXISTS (
            SELECT 1 FROM sys.key_constraints
            WHERE name = 'UQ_EdCeoDueSubmissionReminderLog'
              AND parent_object_id = OBJECT_ID('dbo.EdCeoDueSubmissionReminderLog')
        )
        BEGIN
            ALTER TABLE dbo.EdCeoDueSubmissionReminderLog
            ADD CONSTRAINT UQ_EdCeoDueSubmissionReminderLog UNIQUE (ReminderKind, DueDate);
        END
    `);
}

async function fetchEdCeoRequestNosDueOn(dueYmd) {
    const res = await sql.query`
        SELECT em.RequestNo
        FROM EnquiryMaster em
        WHERE em.DueDate IS NOT NULL
          AND ISNULL(em.ED_CEOSignatureRequired, 0) = 1
          AND CONVERT(VARCHAR(10), em.DueDate, 23) = ${dueYmd}
          AND (em.EnquiryStatus IS NULL OR LTRIM(RTRIM(em.EnquiryStatus)) = '' OR em.EnquiryStatus <> 'Inactive')
        ORDER BY em.RequestNo
    `;
    return (res.recordset || []).map((r) => String(r.RequestNo || '').trim()).filter(Boolean);
}

async function loadLeadDivisionNames(requestNo) {
    const res = await sql.query`
        SELECT
            EF.ItemName,
            MEF.DepartmentName
        FROM EnquiryFor EF
        LEFT JOIN Master_EnquiryFor MEF ON (
            LTRIM(RTRIM(MEF.ItemName)) = LTRIM(RTRIM(EF.ItemName))
            OR LTRIM(RTRIM(MEF.DepartmentName)) = LTRIM(RTRIM(EF.ItemName))
        )
        WHERE EF.RequestNo = ${requestNo}
        ORDER BY EF.ID
    `;
    const seen = new Set();
    const out = [];
    for (const row of res.recordset || []) {
        const division = String(row.DepartmentName || row.ItemName || '').trim();
        if (!division) continue;
        const key = division.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(division);
    }
    return out;
}

function mapRowToListEntry(row, divisionName) {
    return {
        division: String(divisionName || '').trim(),
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

/**
 * One table row per lead division (EnquiryFor) for enquiries with ED/CEO signature required.
 */
async function buildEdCeoDueEnquiryRows(dueYmd) {
    const requestNos = await fetchEdCeoRequestNosDueOn(dueYmd);
    const rows = [];

    for (const requestNo of requestNos) {
        const row = await loadEnquiryEmailRow(requestNo);
        if (!row) continue;

        let divisions = await loadLeadDivisionNames(requestNo);
        if (!divisions.length) {
            divisions = Array.isArray(row.DivisionsInvolvedList)
                ? row.DivisionsInvolvedList.filter(Boolean)
                : [];
        }
        if (!divisions.length && row.DivisionsInvolvedDisplay) {
            divisions = String(row.DivisionsInvolvedDisplay)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
        }
        if (!divisions.length) {
            divisions = [''];
        }

        for (const division of divisions) {
            rows.push(mapRowToListEntry(row, division));
        }
    }

    rows.sort((a, b) => {
        const div = a.division.localeCompare(b.division, undefined, { sensitivity: 'base' });
        if (div !== 0) return div;
        return a.requestNo.localeCompare(b.requestNo, undefined, { numeric: true });
    });

    return rows;
}

async function wasEdCeoReminderSent(kind, dueYmd) {
    const res = await sql.query`
        SELECT TOP 1 1 AS sent
        FROM EdCeoDueSubmissionReminderLog
        WHERE ReminderKind = ${kind}
          AND CONVERT(VARCHAR(10), DueDate, 23) = ${dueYmd}
    `;
    return (res.recordset || []).length > 0;
}

/** Reserve send slot before SMTP — only one process can claim (ReminderKind, DueDate). */
async function tryClaimEdCeoReminderSlot(kind, dueYmd) {
    try {
        await sql.query`
            INSERT INTO EdCeoDueSubmissionReminderLog (ReminderKind, DueDate)
            VALUES (${kind}, ${dueYmd})
        `;
        return true;
    } catch (err) {
        if (isSqlUniqueViolation(err)) return false;
        throw err;
    }
}

async function releaseEdCeoReminderClaim(kind, dueYmd) {
    await sql.query`
        DELETE FROM EdCeoDueSubmissionReminderLog
        WHERE ReminderKind = ${kind}
          AND CONVERT(VARCHAR(10), DueDate, 23) = ${dueYmd}
    `;
}

async function sendEdCeoDueReminder(kind, dueYmd, enquiryRows, options = {}) {
    const toEmails = edCeoReminderToEmails();
    const bccEmails = edCeoReminderBccEmails();
    if (!toEmails.length) {
        return { sent: false, reason: 'no-recipient' };
    }
    if (!enquiryRows?.length) {
        return { sent: false, reason: 'empty' };
    }

    if (!options.force) {
        const claimed = await tryClaimEdCeoReminderSlot(kind, dueYmd);
        if (!claimed) {
            return { sent: false, reason: 'already-sent' };
        }
    }

    const subject = buildEdCeoReminderSubject(kind, dueYmd);
    const html = buildEdCeoReminderEmailHtml(kind, dueYmd, enquiryRows);

    try {
        await sendEnquiryNotificationViaSmtp({
            fromEmail: edCeoReminderFromEmail(),
            to: toEmails.join(','),
            cc: '',
            bcc: bccEmails.join(','),
            subject,
            html,
            skipRecipientExclusions: true,
        });
    } catch (err) {
        if (!options.force) {
            await releaseEdCeoReminderClaim(kind, dueYmd).catch(() => {});
        }
        throw err;
    }

    console.log(
        `[ed-ceo-due-reminder] Sent ${kind} to ${toEmails.join('; ')}` +
            (bccEmails.length ? ` (bcc: ${bccEmails.join('; ')})` : '') +
            ` (${enquiryRows.length} row(s), due ${dueYmd})`,
    );
    return { sent: true, to: toEmails.join('; '), bcc: bccEmails.join('; '), count: enquiryRows.length };
}

/**
 * ED/CEO signature required — consolidated due-date reminders (EMS_ED_CEO_DUE_REMINDER_TO / _BCC).
 * @param {{ todayYmd?: string, force?: boolean }} [options]
 */
async function runEdCeoDueSubmissionReminders(options = {}) {
    await ensureEdCeoDueSubmissionReminderLogTable();

    const todayYmd = String(options.todayYmd || todayYmdInSchedulerTz()).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(todayYmd)) {
        throw new Error(`Invalid todayYmd: ${todayYmd}`);
    }

    /** Weekly off Fri+Sat (EMS_WORKING_WEEKEND_DAYS=5,6) — no reminder dispatch on off days. */
    if (!options.force && !isWorkingDayYmd(todayYmd)) {
        console.log(
            `[ed-ceo-due-reminder] Skipped for ${todayYmd} — weekly off day (Fri/Sat by default).`,
        );
        return {
            todayYmd,
            sent: 0,
            skipped: 2,
            failed: 0,
            jobs: [],
            weeklyOff: true,
        };
    }

    const dueForTwoWorking = addWorkingDaysToYmd(todayYmd, 2);
    const jobs = [
        { kind: REMINDER_KIND_TWO_WORKING, dueYmd: dueForTwoWorking },
        { kind: REMINDER_KIND_TODAY, dueYmd: todayYmd },
    ];

    const summary = { todayYmd, sent: 0, skipped: 0, failed: 0, jobs: [] };

    for (const job of jobs) {
        const entry = { ...job, rows: 0, status: 'skipped' };
        try {
            const rows = await buildEdCeoDueEnquiryRows(job.dueYmd);
            entry.rows = rows.length;
            if (!rows.length) {
                summary.skipped += 1;
                entry.status = 'empty';
                summary.jobs.push(entry);
                continue;
            }
            if (!options.force && (await wasEdCeoReminderSent(job.kind, job.dueYmd))) {
                summary.skipped += 1;
                entry.status = 'already-sent';
                summary.jobs.push(entry);
                continue;
            }
            const result = await sendEdCeoDueReminder(job.kind, job.dueYmd, rows, options);
            if (result.sent) {
                summary.sent += 1;
                entry.status = 'sent';
            } else {
                summary.skipped += 1;
                entry.status = result.reason || 'skipped';
            }
        } catch (err) {
            summary.failed += 1;
            entry.status = 'failed';
            entry.error = err.message;
            console.error(`[ed-ceo-due-reminder] Failed ${job.kind} due ${job.dueYmd}:`, err.message);
        }
        summary.jobs.push(entry);
    }

    console.log(
        `[ed-ceo-due-reminder] Done for ${todayYmd} — sent: ${summary.sent}, skipped: ${summary.skipped}, failed: ${summary.failed}.`,
    );
    return summary;
}

module.exports = {
    runEdCeoDueSubmissionReminders,
    buildEdCeoReminderSubject,
    buildEdCeoReminderEmailHtml,
    buildEdCeoEnquiryListTableHtml,
    REMINDER_KIND_TWO_WORKING,
    REMINDER_KIND_TODAY,
};
