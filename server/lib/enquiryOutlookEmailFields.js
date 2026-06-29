/**
 * Resolve To (all concerned SEs) and CC (Master_EnquiryFor CCMailIds) for enquiry Outlook draft.
 */
const { sql } = require('../dbConfig');
const {
    isExcludedNotificationEmail,
    normalizeNotificationEmail,
    filterNotificationEmails,
    filterNotificationRecipients,
    EXCLUDED_NOTIFICATION_EMAILS,
} = require('./notificationEmailExclusions');

function parseMailCsv(raw) {
    return String(raw || '')
        .split(/[;,]/g)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
}

function normalizeEmail(email) {
    return normalizeNotificationEmail(email);
}

function isExcludedCcEmail(email) {
    return isExcludedNotificationEmail(email);
}

function uniqueSeNames(names) {
    const seen = new Set();
    const out = [];
    for (const raw of names || []) {
        const name = String(raw || '').trim();
        if (!name) continue;
        const key = name.toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    return out;
}

async function loadConcernedSeNamesFromDb(requestNo) {
    const reqNo = String(requestNo || '').trim();
    if (!reqNo) return [];

    const csRes = await sql.query`
        SELECT LTRIM(RTRIM(ISNULL(SEName, N''))) AS SeName
        FROM ConcernedSE
        WHERE RequestNo = ${reqNo}
          AND LTRIM(RTRIM(ISNULL(SEName, N''))) <> N''
        ORDER BY ID
    `;
    return uniqueSeNames((csRes.recordset || []).map((r) => r.SeName));
}

async function resolveToEmailsForSeNames(seNames) {
    const names = uniqueSeNames(seNames);
    if (!names.length) return [];

    const toSet = new Set();
    for (const seName of names) {
        const toRes = await sql.query`
            SELECT TOP 1 LOWER(LTRIM(RTRIM(EmailId))) AS EmailIdNorm
            FROM Master_ConcernedSE
            WHERE UPPER(LTRIM(RTRIM(ISNULL(FullName, N'')))) = UPPER(LTRIM(RTRIM(${seName})))
              AND LTRIM(RTRIM(ISNULL(EmailId, N''))) <> N''
        `;
        const email = toRes.recordset?.[0]?.EmailIdNorm;
        if (email && !isExcludedNotificationEmail(email)) {
            toSet.add(normalizeEmail(email));
        }
    }
    return [...toSet];
}

/**
 * @param {string} requestNo
 * @param {{ concernedSEs?: string[] }} [options] - Optional SE names from form (used if DB not yet visible)
 */
async function resolveEnquiryOutlookEmailFields(requestNo, options = {}) {
    const reqNo = String(requestNo || '').trim();
    const ccSet = new Set();

    let seNames = uniqueSeNames(options.concernedSEs);
    if (!seNames.length && reqNo) {
        seNames = await loadConcernedSeNamesFromDb(reqNo);
    }

    const toEmails = await resolveToEmailsForSeNames(seNames);
    const toSet = new Set(toEmails);

    if (reqNo) {
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
                WHERE E.RequestNo = ${reqNo}
                  AND LTRIM(RTRIM(ISNULL(M.CCMailIds, N''))) <> N''
            `;
            for (const row of ccRes.recordset || []) {
                parseMailCsv(row.CCMailIds).forEach((e) => {
                    const norm = normalizeEmail(e);
                    if (!isExcludedCcEmail(norm)) {
                        ccSet.add(norm);
                    }
                });
            }
        } catch (err) {
            console.error('[enquiry-outlook] CC lookup failed:', err.message);
        }
    }

    return {
        ...filterNotificationRecipients({
            toList: [...toSet],
            ccList: [...ccSet],
        }),
        seNames,
    };
}

/**
 * Site-visit / due-date reminders: all assigned SEs + CCMailIds in To only (no Cc).
 * @param {string} requestNo
 * @param {{ concernedSEs?: string[] }} [options]
 */
async function resolveEnquiryReminderRecipients(requestNo, options = {}) {
    const fields = await resolveEnquiryOutlookEmailFields(requestNo, options);
    const toList = filterNotificationEmails([
        ...(fields.toList || []),
        ...(fields.ccList || []),
    ]);
    return {
        toList,
        to: toList.join('; '),
        cc: '',
        ccList: [],
        seNames: fields.seNames,
    };
}

module.exports = {
    resolveEnquiryOutlookEmailFields,
    resolveEnquiryReminderRecipients,
    resolveToEmailsForSeNames,
    loadConcernedSeNamesFromDb,
    parseMailCsv,
    normalizeEmail,
    isExcludedCcEmail,
    CC_EXCLUDED_EMAILS: EXCLUDED_NOTIFICATION_EMAILS,
};
