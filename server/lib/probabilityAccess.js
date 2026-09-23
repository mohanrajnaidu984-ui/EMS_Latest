'use strict';

const { parseUserDepartments } = require('./userDepartments');

const normEmail = (s) =>
    String(s || '')
        .toLowerCase()
        .trim()
        .replace(/@almcg\.com$/i, '@almoayyedcg.com');

const normKey = (s) => String(s || '').trim().toLowerCase();

function emailInCsvList(csv, email) {
    const e = normEmail(email);
    if (!e) return false;
    const padded = `,${String(csv || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/;/g, ',')},`;
    return padded.includes(`,${e},`);
}

function divisionCodeInQuoteNumber(quoteNumber, divisionCode) {
    const qn = String(quoteNumber || '').toUpperCase();
    const dc = String(divisionCode || '').trim().toUpperCase();
    if (!dc) return false;
    return (
        qn.includes(`/${dc}/`) ||
        qn.includes(`-${dc}/`) ||
        qn.includes(`/${dc}-`)
    );
}

function quoteMatchesDivision(quoteNumber, division, mefRows) {
    const divNorm = normKey(division);
    for (const mef of mefRows || []) {
        if (normKey(mef.DepartmentName) !== divNorm) continue;
        if (divisionCodeInQuoteNumber(quoteNumber, mef.DivisionCode)) return true;
    }
    return false;
}

/** True if quote matches any division in a multi-select CSV. */
function quoteMatchesAnyDivision(quoteNumber, divisionCsv, mefRows) {
    const tokens = parseUserDepartments(divisionCsv);
    if (!tokens.length) return false;
    return tokens.some((d) => quoteMatchesDivision(quoteNumber, d, mefRows));
}

/**
 * Quote visible in Probability list/detail when user may act on that enquiry in the division:
 * - Admin
 * - Quote preparer
 * - Concerned SE assigned to the enquiry (division-scoped quotes)
 * - CommonMailIds / CCMailIds on Master_EnquiryFor for the division
 */
function quoteVisibleForProbability(quote, ctx) {
    if (ctx.isAdmin) return true;

    const email = normEmail(ctx.userEmail);
    const prep = String(quote.PreparedByEmail || '').trim().toUpperCase();
    if (email && prep && prep === email.toUpperCase()) return true;

    const requestNo = String(quote.RequestNo || '').trim();
    const divisionCsv = String(ctx.division || '').trim();
    const mefRows = ctx.mefRows || [];
    const divisionTokens = parseUserDepartments(divisionCsv);

    if (!quoteMatchesAnyDivision(quote.QuoteNumber, divisionCsv, mefRows)) return false;

    if (ctx.assignedRequestNos?.has(requestNo)) return true;

    for (const mef of mefRows) {
        if (!divisionTokens.some((d) => normKey(mef.DepartmentName) === normKey(d))) continue;
        if (emailInCsvList(mef.CommonMailIds, email) || emailInCsvList(mef.CCMailIds, email)) {
            return true;
        }
    }

    return false;
}

module.exports = {
    normEmail,
    normKey,
    emailInCsvList,
    divisionCodeInQuoteNumber,
    quoteMatchesDivision,
    quoteMatchesAnyDivision,
    quoteVisibleForProbability,
};
