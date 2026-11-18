'use strict';

/**
 * SMTP notify to direct-parent job SEs when a subjob quote is finalized
 * (final approver promotes generated/revised quote) for an internal parent customer.
 */

const sql = require('mssql');
const { getSmtpFromEmail } = require('./smtpTransport');
const { filterNotificationRecipients } = require('./notificationEmailExclusions');
const { escapeHtml } = require('./htmlEscape');
const { sendEnquiryNotificationViaSmtp } = require('./enquiryNotifySmtp');
const {
    userHasDepartment,
    anyDepartmentTokenMatchesJobName,
} = require('./userDepartments');
const { normJobKey, seBelongsToOwnJobDivision } = require('./pickConcernedSeMembersForQuote');

function cleanJobLabel(s) {
    return String(s || '')
        .replace(/^(L\d+|Sub Job)\s*-\s*/i, '')
        .trim();
}

function formatQuoteDate(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) {
        const raw = String(date).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
            const parsed = new Date(`${raw.slice(0, 10)}T12:00:00`);
            if (!Number.isNaN(parsed.getTime())) {
                return parsed
                    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    .replace(/ /g, '-');
            }
        }
        return raw;
    }
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
}

function quoteEventVerb(revisionNo) {
    return Number(revisionNo) > 0 ? 'revised' : 'generated';
}

function buildParentSubjobNotifySubject(quoteRef, revisionNo) {
    const ref = String(quoteRef || '').trim() || '—';
    return `Quote ref: ${ref} has been ${quoteEventVerb(revisionNo)} in the EMS`;
}

function buildParentSubjobDetailsTableHtml(fields = {}) {
    const rows = [
        ['Quote Ref', fields.quoteRef],
        ['Quote Date', fields.quoteDate],
        ['Enquiry No', fields.enquiryNo],
        ['Project Name', fields.projectName],
        ['Customer Name', fields.customerName],
        ['Subject', fields.subject],
        ['Company Name', fields.companyName],
        ['From Division Name', fields.fromDivisionName],
    ];
    const rowPx = 24;
    const labelCellStyle = [
        'height:24px',
        'max-height:24px',
        'padding:0 8px',
        'margin:0',
        'border:1px solid #d1d5db',
        'font-size:12px',
        'line-height:24px',
        'mso-line-height-rule:exactly',
        'vertical-align:middle',
        'font-weight:600',
        'background:#f1f5f9',
        'width:34%',
        'font-family:Arial,sans-serif',
        'color:#1e293b',
    ].join(';');
    const valueCellStyle = [
        'height:24px',
        'max-height:24px',
        'padding:0 8px',
        'margin:0',
        'border:1px solid #d1d5db',
        'font-size:12px',
        'line-height:24px',
        'mso-line-height-rule:exactly',
        'vertical-align:middle',
        'background:#ffffff',
        'font-family:Arial,sans-serif',
        'color:#1e293b',
    ].join(';');

    return rows
        .map(
            ([label, val]) => `
        <tr height="${rowPx}" style="height:${rowPx}px; max-height:${rowPx}px; mso-line-height-rule:exactly;">
            <td height="${rowPx}" style="${labelCellStyle}">${escapeHtml(label)}</td>
            <td height="${rowPx}" style="${valueCellStyle}">${escapeHtml(String(val || '').trim() || '—')}</td>
        </tr>`
        )
        .join('');
}

function buildParentSubjobNotifyHtml({ eventVerb, ...fields } = {}) {
    const verb = String(eventVerb || 'generated').trim().toLowerCase() === 'revised' ? 'revised' : 'generated';
    const tableRows = buildParentSubjobDetailsTableHtml(fields);
    return `
        <div style="font-family: Arial, sans-serif; color: #1e293b; font-size: 14px; line-height: 1.5;">
            <p style="margin:0 0 8px 0;">Dear Sir/ Madam,</p>
            <p style="margin:0 0 8px 0;">Please note that the below quote has been ${verb} in the EMS. Kindly login to the EMS to view the quote.</p>
            <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse; border-spacing:0; width:100%; max-width:640px; margin:8px 0; table-layout:fixed;">
                ${tableRows}
            </table>
            <p style="margin-top:16px; font-size:12px; color:#64748b; font-style:italic;">* This is an auto generated email from Enquiry Management System *</p>
        </div>
    `;
}

function parentIdOf(row) {
    const raw = row?.ParentID ?? row?.parentId;
    if (raw == null || String(raw).trim() === '' || String(raw) === '0') return null;
    return raw;
}

/**
 * Resolve OwnJob → direct parent EnquiryFor row.
 * When the same ItemName exists as both a subjob and a root (e.g. HVAC under Civil + HVAC L2 root),
 * prefer the subjob whose parent ItemName matches ToName (internal parent customer).
 * @param {string} [toName] quote customer — used to disambiguate duplicate OwnJob rows
 */
async function resolveDirectParentJob(requestNo, ownJobName, toName = '') {
    const rn = String(requestNo || '').trim();
    const ownTrim = cleanJobLabel(ownJobName);
    if (!rn || !ownTrim) return null;

    const ownKey = normJobKey(ownTrim);
    const toKey = normJobKey(cleanJobLabel(toName));
    const jobRes = await sql.query`
        SELECT ID, ParentID, ItemName
        FROM EnquiryFor
        WHERE RequestNo = ${rn}
        ORDER BY ID
    `;
    const rows = jobRes.recordset || [];
    const byId = new Map(rows.map((r) => [String(r.ID), r]));
    const candidates = rows.filter((r) => normJobKey(cleanJobLabel(r.ItemName)) === ownKey);
    if (!candidates.length) return null;

    const asHierarchy = (ownRow, parentRow) => ({
        ownJobName: cleanJobLabel(ownRow.ItemName) || ownTrim,
        parentJobName: cleanJobLabel(parentRow.ItemName),
        parentId: parentRow.ID,
    });

    const withParents = [];
    for (const ownRow of candidates) {
        const pid = parentIdOf(ownRow);
        if (!pid) continue;
        let parentRow = byId.get(String(pid));
        if (!parentRow) {
            const parentRes = await sql.query`
                SELECT TOP 1 ID, ParentID, ItemName
                FROM EnquiryFor
                WHERE RequestNo = ${rn} AND ID = ${pid}
            `;
            parentRow = parentRes.recordset?.[0];
        }
        if (!parentRow) continue;
        withParents.push({ ownRow, parentRow });
    }

    if (!withParents.length) return null; /* OwnJob only appears as root(s) — no parent notify */

    if (toKey) {
        const matched = withParents.find(
            (x) => normJobKey(cleanJobLabel(x.parentRow.ItemName)) === toKey
        );
        if (matched) return asHierarchy(matched.ownRow, matched.parentRow);
        /* ToName is not any direct parent of this OwnJob (external / other) — do not invent a parent. */
        return null;
    }

    return asHierarchy(withParents[0].ownRow, withParents[0].parentRow);
}

/** True when ToName is the direct parent internal customer (not an external customer). */
function isInternalParentCustomer(toName, parentJobName) {
    const toKey = normJobKey(cleanJobLabel(toName));
    const parentKey = normJobKey(cleanJobLabel(parentJobName));
    return Boolean(toKey && parentKey && toKey === parentKey);
}

async function resolveCompanyNameForDivision(divisionName) {
    const div = cleanJobLabel(divisionName);
    if (!div) return '';
    try {
        const res = await sql.query`
            SELECT TOP 1 CompanyName
            FROM Master_EnquiryFor
            WHERE LTRIM(RTRIM(ISNULL(CompanyName, N''))) <> N''
              AND (
                LTRIM(RTRIM(ISNULL(ItemName, N''))) = LTRIM(RTRIM(${div}))
                OR LTRIM(RTRIM(ISNULL(DepartmentName, N''))) = LTRIM(RTRIM(${div}))
              )
            ORDER BY CASE
                WHEN LTRIM(RTRIM(ISNULL(ItemName, N''))) = LTRIM(RTRIM(${div})) THEN 0
                ELSE 1 END
        `;
        return String(res.recordset?.[0]?.CompanyName || '').trim();
    } catch (e) {
        console.warn('[quoteParentSubjobNotify] company resolve:', e.message);
        return '';
    }
}

/**
 * ConcernedSE emails for a specific OwnJob on the enquiry (division assignees).
 * Applies the same department-vs-OwnJob filter used in quote listing.
 */
async function resolveAssignedSeEmailsForOwnJob(requestNo, ownJobName) {
    const rn = String(requestNo || '').trim();
    const ownTrim = cleanJobLabel(ownJobName);
    const ownKey = normJobKey(ownTrim);
    if (!rn || !ownKey) return [];

    const seRes = await sql.query`
        SELECT
            cse.SEName,
            cse.ownjob,
            cse.accountability,
            cse.leadjobcode,
            mcs.EmailId,
            mcs.Department
        FROM ConcernedSE cse
        LEFT JOIN Master_ConcernedSE mcs
            ON UPPER(LTRIM(RTRIM(ISNULL(mcs.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cse.SEName, N''))))
           AND (
                mcs.Status = N'Active'
                OR mcs.Status IS NULL
                OR LTRIM(RTRIM(ISNULL(mcs.Status, N''))) = N''
           )
        WHERE cse.RequestNo = ${rn}
        ORDER BY cse.SEName
    `;

    const emails = [];
    const seen = new Set();
    for (const r of seRes.recordset || []) {
        const rowOwn = normJobKey(r.ownjob);
        if (rowOwn && rowOwn !== ownKey) continue;
        if (!rowOwn) continue;
        if (!seBelongsToOwnJobDivision(r, ownTrim, ownKey)) continue;
        const em = String(r.EmailId || '')
            .trim()
            .toLowerCase();
        if (!em || seen.has(em)) continue;
        /* Prefer Active Master users; NULL/blank Status treated as active. */
        seen.add(em);
        emails.push(em);
    }

    /* Fallback: Master users whose Department matches OwnJob and who appear on this enquiry. */
    if (!emails.length) {
        for (const r of seRes.recordset || []) {
            const dept = String(r.Department || '').trim();
            if (
                !dept ||
                !(
                    userHasDepartment(dept, ownTrim) ||
                    anyDepartmentTokenMatchesJobName(dept, ownTrim)
                )
            ) {
                continue;
            }
            const em = String(r.EmailId || '')
                .trim()
                .toLowerCase();
            if (!em || seen.has(em)) continue;
            seen.add(em);
            emails.push(em);
        }
    }

    return emails;
}

function resolvePreparedByFromAddress(preparedByEmail, preparedByName) {
    const email = String(preparedByEmail || '')
        .trim()
        .toLowerCase();
    if (!email || !email.includes('@')) {
        return getSmtpFromEmail();
    }
    const name = String(preparedByName || '').trim();
    if (name) {
        const safeName = name.replace(/[\r\n"<>]/g, '').trim();
        return safeName ? `"${safeName}" <${email}>` : email;
    }
    return email;
}

async function sendParentSubjobMail({ toList, ccList, subject, html, preparedByEmail, preparedByName }) {
    const filtered = filterNotificationRecipients({ toList, ccList });
    if (!filtered.toList.length) {
        return { success: false, error: 'No parent-job SE recipients', skipped: true };
    }

    const fromAddress = resolvePreparedByFromAddress(preparedByEmail, preparedByName);
    const t0 = Date.now();
    await sendEnquiryNotificationViaSmtp({
        to: filtered.to,
        cc: filtered.cc,
        subject: String(subject || ''),
        html: String(html || ''),
        fromEmail: fromAddress,
    });
    console.log(
        `[quoteParentSubjobNotify] delivered in ${Date.now() - t0}ms from=${fromAddress} to=${filtered.toList.length} cc=${filtered.ccList.length}`
    );
    return {
        success: true,
        via: 'smtp',
        from: fromAddress,
        to: filtered.toList,
        cc: filtered.ccList,
        elapsedMs: Date.now() - t0,
    };
}

/**
 * After final-approver promote: email parent-job SEs (To) and ownjob SEs (CC)
 * only when OwnJob is a direct subjob and ToName is that internal parent customer.
 */
async function notifyParentJobSEsOnSubjobQuotePromoted({
    requestNo,
    ownJobName,
    toName,
    quoteNumber,
    quoteDate,
    revisionNo,
    subject,
    projectName,
    preparedByEmail,
    preparedByName,
} = {}) {
    try {
        const hierarchy = await resolveDirectParentJob(requestNo, ownJobName, toName);
        if (!hierarchy?.parentJobName) {
            return { success: false, skipped: true, reason: 'no-parent-job' };
        }
        if (!isInternalParentCustomer(toName, hierarchy.parentJobName)) {
            return { success: false, skipped: true, reason: 'not-internal-parent-customer' };
        }

        const [toEmails, ccEmails, companyName, enqRow] = await Promise.all([
            resolveAssignedSeEmailsForOwnJob(requestNo, hierarchy.parentJobName),
            resolveAssignedSeEmailsForOwnJob(requestNo, hierarchy.ownJobName || ownJobName),
            resolveCompanyNameForDivision(hierarchy.ownJobName || ownJobName),
            (async () => {
                const rn = String(requestNo || '').trim();
                if (!rn) return {};
                const r = await sql.query`
                    SELECT TOP 1 ProjectName FROM EnquiryMaster WHERE RequestNo = ${rn}
                `;
                return r.recordset?.[0] || {};
            })(),
        ]);

        const eventVerb = quoteEventVerb(revisionNo);
        const quoteRef = String(quoteNumber || '').trim();
        const fields = {
            quoteRef,
            quoteDate: formatQuoteDate(quoteDate),
            enquiryNo: String(requestNo || '').trim(),
            projectName: String(projectName || enqRow.ProjectName || '').trim(),
            customerName: cleanJobLabel(toName),
            subject: String(subject || '').trim(),
            companyName,
            fromDivisionName: hierarchy.ownJobName || cleanJobLabel(ownJobName),
        };

        const mailSubject = buildParentSubjobNotifySubject(quoteRef, revisionNo);
        const html = buildParentSubjobNotifyHtml({ eventVerb, ...fields });

        if (!toEmails.length) {
            console.warn(
                `[quoteParentSubjobNotify] skip send: no parent SE emails for ${hierarchy.parentJobName} on ${requestNo}`
            );
            return { success: false, skipped: true, reason: 'no-parent-se-emails', fields };
        }

        const result = await sendParentSubjobMail({
            toList: toEmails,
            ccList: ccEmails,
            subject: mailSubject,
            html,
            preparedByEmail,
            preparedByName,
        });
        return {
            ...result,
            eventVerb,
            parentJobName: hierarchy.parentJobName,
            ownJobName: hierarchy.ownJobName,
            fields,
        };
    } catch (err) {
        console.error('[quoteParentSubjobNotify] failed:', err);
        return { success: false, error: err.message || String(err) };
    }
}

module.exports = {
    notifyParentJobSEsOnSubjobQuotePromoted,
    resolveDirectParentJob,
    isInternalParentCustomer,
    resolveAssignedSeEmailsForOwnJob,
    resolveCompanyNameForDivision,
    buildParentSubjobNotifySubject,
    buildParentSubjobNotifyHtml,
    buildParentSubjobDetailsTableHtml,
    quoteEventVerb,
    formatQuoteDate,
    cleanJobLabel,
};
