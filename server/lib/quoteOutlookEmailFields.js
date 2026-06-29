/**
 * Resolve To (attention person) and CC (user division CCMailIds) for quote Outlook drafts.
 */

const {
    EXCLUDED_NOTIFICATION_EMAILS,
    isExcludedNotificationEmail,
    filterNotificationEmails,
    filterNotificationRecipients,
    normalizeNotificationEmail,
} = require('./notificationEmailExclusions');

const OUTLOOK_CC_EXCLUDED = EXCLUDED_NOTIFICATION_EMAILS;

function normalizeMail(raw) {
    return normalizeNotificationEmail(raw);
}

function normLoose(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripAttentionPrefix(display) {
    return String(display || '')
        .replace(/^(mr|mrs|ms|miss|dr|prof|eng)\.?\s+/i, '')
        .trim();
}

function parseMailList(raw) {
    return Array.from(
        new Set(
            String(raw || '')
                .replace(/;/g, ',')
                .split(',')
                .map((m) => normalizeMail(m))
                .filter(Boolean)
        )
    );
}

function filterCcMails(mails) {
    return filterNotificationEmails(mails);
}

/**
 * @param {import('mssql').ConnectionPool|object} sql
 */
async function getUserDivisionCcMails(sql, userEmail) {
    const normalizedEmail = normalizeMail(userEmail);
    if (!normalizedEmail) return [];

    const deptRes = await sql.query`
        SELECT TOP 1 Department
        FROM Master_ConcernedSE
        WHERE LOWER(LTRIM(RTRIM(EmailId))) = ${normalizedEmail}
           OR LOWER(LTRIM(RTRIM(EmailId))) = ${normalizedEmail.replace(/@almoayyedcg\.com$/i, '@almcg.com')}
    `;
    const dept = deptRes.recordset?.[0]?.Department
        ? String(deptRes.recordset[0].Department).trim()
        : '';
    if (!dept) return [];

    let ccRes = await sql.query`
        SELECT TOP 1 CCMailIds
        FROM Master_EnquiryFor
        WHERE LTRIM(RTRIM(ItemName)) = LTRIM(RTRIM(${dept}))
           OR ItemName = ${dept}
    `;
    let ccRaw = (ccRes.recordset?.[0]?.CCMailIds || '').toString();
    if (!ccRaw.trim()) {
        const safe = String(dept).replace(/%/g, '');
        ccRes = await sql.query`
            SELECT TOP 1 CCMailIds
            FROM Master_EnquiryFor
            WHERE LTRIM(RTRIM(ItemName)) LIKE ${'%' + safe + '%'}
        `;
        ccRaw = (ccRes.recordset?.[0]?.CCMailIds || '').toString();
    }
    return filterCcMails(parseMailList(ccRaw));
}

/**
 * @param {import('mssql').ConnectionPool|object} sql
 */
async function resolveAttentionToEmail(sql, { toName, toAttention, isInternal, requestNo }) {
    const attention = String(toAttention || '').trim();
    if (!attention) return '';

    const attLoose = normLoose(attention);
    const attBare = normLoose(stripAttentionPrefix(attention));

    if (isInternal) {
        const masterRes = await sql.query`
            SELECT FullName, EmailId, Prefix
            FROM Master_ConcernedSE
            WHERE FullName IS NOT NULL AND LTRIM(RTRIM(FullName)) <> N''
              AND EmailId IS NOT NULL AND LTRIM(RTRIM(EmailId)) <> N''
              AND (Status = N'Active' OR Status IS NULL OR LTRIM(RTRIM(ISNULL(Status, N''))) = N'')
        `;
        for (const row of masterRes.recordset || []) {
            const fn = String(row.FullName || '').trim();
            const prefix = String(row.Prefix || '').trim();
            const display = prefix
                ? `${prefix.replace(/[.!?,;:]+$/g, '')}. ${fn}`.replace(/\s+/g, ' ')
                : fn;
            const candidates = [normLoose(fn), normLoose(display), normLoose(stripAttentionPrefix(display))];
            if (
                candidates.includes(attLoose) ||
                candidates.includes(attBare) ||
                (attBare.length >= 4 && candidates.some((c) => c.includes(attBare) || attBare.includes(c)))
            ) {
                return normalizeMail(row.EmailId);
            }
        }

        if (requestNo) {
            const seRes = await sql.query`
                SELECT cs.SEName, m.EmailId, m.FullName, m.Prefix
                FROM ConcernedSE cs
                LEFT JOIN Master_ConcernedSE m
                  ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                WHERE cs.RequestNo = ${requestNo}
            `;
            for (const row of seRes.recordset || []) {
                const se = String(row.SEName || row.FullName || '').trim();
                const fn = String(row.FullName || se).trim();
                const kSe = normLoose(se);
                const kFn = normLoose(fn);
                if (kSe === attLoose || kFn === attLoose || kSe === attBare || kFn === attBare) {
                    const em = normalizeMail(row.EmailId);
                    if (em) return em;
                }
            }
        }
        return '';
    }

    const company = String(toName || '').replace(/,+$/, '').trim();
    if (!company) return '';

    const mrfRes = await sql.query`
        SELECT ContactName, CompanyName, EmailId, Prefix
        FROM Master_ReceivedFrom
        WHERE EmailId IS NOT NULL AND LTRIM(RTRIM(EmailId)) <> N''
          AND (
            LTRIM(RTRIM(CompanyName)) = LTRIM(RTRIM(${company}))
            OR LOWER(LTRIM(RTRIM(CompanyName))) = LOWER(LTRIM(RTRIM(${company})))
          )
    `;

    for (const row of mrfRes.recordset || []) {
        const contact = String(row.ContactName || '').trim();
        const prefix = String(row.Prefix || '').trim();
        const display = prefix
            ? `${prefix.replace(/[.!?,;:]+$/g, '')}. ${contact}`.replace(/\s+/g, ' ')
            : contact;
        const candidates = [
            normLoose(contact),
            normLoose(display),
            normLoose(stripAttentionPrefix(display)),
        ];
        if (
            candidates.includes(attLoose) ||
            candidates.includes(attBare) ||
            (attBare.length >= 4 && candidates.some((c) => c.includes(attBare) || attBare.includes(c)))
        ) {
            return normalizeMail(row.EmailId);
        }
    }

    if (requestNo) {
        const rfRes = await sql.query`
            SELECT rf.ContactName, rf.CompanyName, mrf.EmailId, mrf.Prefix
            FROM ReceivedFrom rf
            LEFT JOIN Master_ReceivedFrom mrf
              ON LTRIM(RTRIM(ISNULL(mrf.ContactName, N''))) = LTRIM(RTRIM(ISNULL(rf.ContactName, N'')))
             AND LTRIM(RTRIM(ISNULL(mrf.CompanyName, N''))) = LTRIM(RTRIM(ISNULL(rf.CompanyName, N'')))
            WHERE rf.RequestNo = ${requestNo}
              AND (
                LTRIM(RTRIM(rf.CompanyName)) = LTRIM(RTRIM(${company}))
                OR LOWER(LTRIM(RTRIM(rf.CompanyName))) = LOWER(LTRIM(RTRIM(${company})))
              )
        `;
        for (const row of rfRes.recordset || []) {
            const contact = String(row.ContactName || '').trim();
            const prefix = String(row.Prefix || '').trim();
            const display = prefix
                ? `${prefix.replace(/[.!?,;:]+$/g, '')}. ${contact}`.replace(/\s+/g, ' ')
                : contact;
            const candidates = [normLoose(contact), normLoose(display), normLoose(stripAttentionPrefix(display))];
            if (candidates.includes(attLoose) || candidates.includes(attBare)) {
                const em = normalizeMail(row.EmailId);
                if (em) return em;
            }
        }
    }

    return '';
}

/**
 * @param {import('mssql').ConnectionPool|object} sql
 */
async function resolveQuoteOutlookEmailFields(sql, { userEmail, toName, toAttention, isInternal, requestNo }) {
    let to = await resolveAttentionToEmail(sql, { toName, toAttention, isInternal, requestNo });
    if (isExcludedNotificationEmail(to)) to = '';
    let ccList = await getUserDivisionCcMails(sql, userEmail);
    return filterNotificationRecipients({ to, ccList });
}

module.exports = {
    OUTLOOK_CC_EXCLUDED,
    normalizeMail,
    filterCcMails,
    getUserDivisionCcMails,
    resolveAttentionToEmail,
    resolveQuoteOutlookEmailFields,
};
