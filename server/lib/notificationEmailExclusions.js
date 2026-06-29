'use strict';

/** Never send emails or in-app notifications to these addresses. */
const EXCLUDED_NOTIFICATION_EMAILS = new Set([
    'lohidas@almoayyedcg.com',
    'mathews@almoayyedcg.com',
    'hala@almoayyedcg.com',
]);

function normalizeNotificationEmail(email) {
    return String(email || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com$/i, '@almoayyedcg.com');
}

function isExcludedNotificationEmail(email) {
    return EXCLUDED_NOTIFICATION_EMAILS.has(normalizeNotificationEmail(email));
}

function filterNotificationEmails(emails) {
    const out = [];
    const seen = new Set();
    for (const raw of emails || []) {
        const norm = normalizeNotificationEmail(raw);
        if (!norm || isExcludedNotificationEmail(norm) || seen.has(norm)) continue;
        seen.add(norm);
        out.push(norm);
    }
    return out;
}

function removeExcludedFromEmailSet(emailSet) {
    if (!emailSet || typeof emailSet[Symbol.iterator] !== 'function') return;
    for (const e of [...emailSet]) {
        if (isExcludedNotificationEmail(e)) emailSet.delete(e);
    }
}

/** Filter To/CC strings or lists; drops excluded addresses and CC duplicates of To. */
function filterNotificationRecipients({ to, cc, toList, ccList } = {}) {
    const toFiltered = filterNotificationEmails(
        toList?.length ? toList : String(to || '').split(/[;,]/),
    );
    const ccFiltered = filterNotificationEmails(
        ccList?.length ? ccList : String(cc || '').split(/[;,]/),
    );
    const toSet = new Set(toFiltered);
    const ccOut = ccFiltered.filter((e) => !toSet.has(e));
    return {
        to: toFiltered.join('; '),
        toList: toFiltered,
        cc: ccOut.join('; '),
        ccList: ccOut,
    };
}

module.exports = {
    EXCLUDED_NOTIFICATION_EMAILS,
    normalizeNotificationEmail,
    isExcludedNotificationEmail,
    filterNotificationEmails,
    removeExcludedFromEmailSet,
    filterNotificationRecipients,
};
