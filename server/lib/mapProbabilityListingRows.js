'use strict';

const { sql } = require('../dbConfig');
const {
    normEmail,
    emailInCsvList,
    quoteVisibleForProbability,
} = require('./probabilityAccess');
const { parseUserDepartments } = require('./userDepartments');

function extractLeadSortCode(quoteNumber) {
    const m = String(quoteNumber || '').toUpperCase().match(/\/L(\d+)\b/);
    return m ? Number(m[1]) : 999999;
}

function sortQuotesForList(quotes) {
    return [...quotes].sort((a, b) => {
        const aCode = extractLeadSortCode(a.QuoteNumber);
        const bCode = extractLeadSortCode(b.QuoteNumber);
        if (aCode !== bCode) return aCode - bCode;
        const aq = String(a.QuoteNumber || '').trim();
        const bq = String(b.QuoteNumber || '').trim();
        if (aq !== bq) return aq.localeCompare(bq);
        const at = String(a.ToName || '').trim();
        const bt = String(b.ToName || '').trim();
        if (at !== bt) return at.localeCompare(bt);
        return Number(b.RevisionNo || 0) - Number(a.RevisionNo || 0);
    });
}

function quoteVisibleToUser(quote, ctx) {
    return quoteVisibleForProbability(quote, ctx);
}

async function fetchUserProfile(userEmail) {
    const email = normEmail(userEmail);
    if (!email) return { fullName: '', isAdmin: false };
    const req = new sql.Request();
    req.input('email', sql.NVarChar, email);
    const r = await req.query(`
        SELECT TOP 1
            LTRIM(RTRIM(ISNULL(FullName, ''))) AS FullName,
            LTRIM(RTRIM(ISNULL(Roles, ''))) AS Roles
        FROM Master_ConcernedSE
        WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = LOWER(LTRIM(RTRIM(ISNULL(@email, ''))))
    `);
    const row = r.recordset?.[0] || {};
    const roles = String(row.Roles || '').toUpperCase();
    return {
        fullName: String(row.FullName || '').trim(),
        isAdmin: roles.includes('ADMIN'),
    };
}

async function fetchAssignedRequestNos(requestNos, fullName) {
    const name = String(fullName || '').trim();
    const ids = [...new Set((requestNos || []).map((n) => String(n || '').trim()).filter(Boolean))];
    if (!name || !ids.length) return new Set();

    const req = new sql.Request();
    req.input('fullName', sql.NVarChar, name);
    const placeholders = ids.map((id, i) => {
        const key = `rn${i}`;
        req.input(key, sql.NVarChar, id);
        return `@${key}`;
    });
    const r = await req.query(`
        SELECT DISTINCT LTRIM(RTRIM(ISNULL(RequestNo, ''))) AS RequestNo
        FROM ConcernedSE
        WHERE UPPER(LTRIM(RTRIM(ISNULL(SEName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@fullName, ''))))
          AND LTRIM(RTRIM(ISNULL(RequestNo, ''))) IN (${placeholders.join(', ')})
    `);
    return new Set((r.recordset || []).map((row) => String(row.RequestNo || '').trim()).filter(Boolean));
}

function formatQuoteRefSegment(q) {
    const quoteDate =
        q.QuoteDate instanceof Date
            ? q.QuoteDate.toISOString().replace('T', ' ').slice(0, 23)
            : q.QuoteDate
              ? String(q.QuoteDate)
              : '';
    const parts = [
        String(q.QuoteNumber || '').trim(),
        String(q.ToName || 'N/A').trim(),
        String(q.LeadJob || '').trim(),
        quoteDate,
        String(q.QuoteType || '').trim(),
        String(q.TotalAmount ?? 0),
    ];
    return parts.join('|');
}

function buildFilteredQuoteRefsString(quotes) {
    if (!quotes.length) return '';
    return sortQuotesForList(quotes).map(formatQuoteRefSegment).join(',');
}

async function fetchMefRowsForDivision(division) {
    const tokens = parseUserDepartments(division);
    if (!tokens.length) return [];
    const req = new sql.Request();
    const orParts = tokens.map((tok, i) => {
        const key = `div${i}`;
        req.input(key, sql.NVarChar, tok);
        return `UPPER(LTRIM(RTRIM(ISNULL(DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@${key}, ''))))`;
    });
    const r = await req.query(`
        SELECT
            LTRIM(RTRIM(ISNULL(ItemName, ''))) AS ItemName,
            LTRIM(RTRIM(ISNULL(DepartmentName, ''))) AS DepartmentName,
            LTRIM(RTRIM(ISNULL(DivisionCode, ''))) AS DivisionCode,
            ISNULL(CommonMailIds, '') AS CommonMailIds,
            ISNULL(CCMailIds, '') AS CCMailIds
        FROM Master_EnquiryFor
        WHERE LTRIM(RTRIM(ISNULL(DepartmentName, ''))) <> ''
          AND (${orParts.join('\n          OR ')})
    `);
    return r.recordset || [];
}

async function fetchQuotesForRequestNos(requestNos) {
    const ids = [...new Set((requestNos || []).map((n) => String(n || '').trim()).filter(Boolean))];
    if (!ids.length) return [];

    const req = new sql.Request();
    const placeholders = ids.map((id, i) => {
        const key = `rn${i}`;
        req.input(key, sql.NVarChar, id);
        return `@${key}`;
    });
    const r = await req.query(`
        SELECT
            LTRIM(RTRIM(ISNULL(RequestNo, ''))) AS RequestNo,
            LTRIM(RTRIM(ISNULL(QuoteNumber, ''))) AS QuoteNumber,
            ISNULL(ToName, 'N/A') AS ToName,
            ISNULL(LeadJob, '') AS LeadJob,
            QuoteDate,
            ISNULL(QuoteType, '') AS QuoteType,
            ISNULL(TotalAmount, 0) AS TotalAmount,
            PreparedByEmail,
            ISNULL(RevisionNo, 0) AS RevisionNo
        FROM EnquiryQuotes
        WHERE LTRIM(RTRIM(ISNULL(RequestNo, ''))) IN (${placeholders.join(', ')})
    `);
    return r.recordset || [];
}

/**
 * Bulk-load division quotes and attach FilteredQuoteRefs / LastQuoteDate per list row.
 * Replaces heavy per-row STUFF/FOR XML and pricing subqueries in the list SQL.
 */
async function enrichProbabilityListRows(rows, { userEmail, division }) {
    if (!Array.isArray(rows) || !rows.length) return rows || [];

    const requestNos = rows.map((r) => r.RequestNo).filter(Boolean);
    const profile = await fetchUserProfile(userEmail);
    const [allQuotes, mefRows, assignedRequestNos] = await Promise.all([
        fetchQuotesForRequestNos(requestNos),
        fetchMefRowsForDivision(division),
        fetchAssignedRequestNos(requestNos, profile.fullName),
    ]);

    const accessCtx = {
        userEmail,
        division,
        mefRows,
        isAdmin: profile.isAdmin,
        assignedRequestNos,
    };
    const quotesByRequest = new Map();
    for (const q of allQuotes) {
        const rn = String(q.RequestNo || '').trim();
        if (!rn) continue;
        if (!quoteVisibleToUser(q, accessCtx)) continue;
        if (!quotesByRequest.has(rn)) quotesByRequest.set(rn, []);
        quotesByRequest.get(rn).push(q);
    }

    return rows.map((row) => {
        const rn = String(row.RequestNo || '').trim();
        const visible = quotesByRequest.get(rn) || [];
        const filtered = buildFilteredQuoteRefsString(visible);
        let lastQuoteDate = null;
        for (const q of visible) {
            if (!q.QuoteDate) continue;
            const t = new Date(q.QuoteDate).getTime();
            if (Number.isNaN(t)) continue;
            if (!lastQuoteDate || t > new Date(lastQuoteDate).getTime()) {
                lastQuoteDate = q.QuoteDate;
            }
        }
        return {
            ...row,
            FilteredQuoteRefs: filtered,
            LastQuoteDate: lastQuoteDate ?? row.LastQuoteDate ?? null,
            QuoteOptions: row.QuoteOptions ?? '',
            TotalQuotedValue: row.TotalQuotedValue ?? null,
        };
    });
}

module.exports = {
    enrichProbabilityListRows,
};
