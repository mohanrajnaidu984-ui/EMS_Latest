'use strict';

/**
 * Resolve Master_EnquiryFor.Currency for a company / division (DepartmentName) / ItemName.
 * Fallback: BHD (legacy EMS default).
 */

const DEFAULT_CURRENCY = 'BHD';

function normKey(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/^(l\d+|sub job)\s*-\s*/i, '')
        .replace(/[^a-z0-9]+/g, '');
}

function pickCurrencyFromRow(row) {
    const raw = String(row?.Currency ?? row?.currency ?? '').trim().toUpperCase();
    return raw || null;
}

/**
 * @param {object[]} rows Master_EnquiryFor recordset
 * @param {{ departmentName?: string, companyName?: string, itemName?: string }} keys
 * @returns {string} ISO-like currency code (e.g. BHD, AED)
 */
function resolveCurrencyFromMasterRows(rows, keys = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const dept = normKey(keys.departmentName || keys.division || keys.DepartmentName);
    const company = normKey(keys.companyName || keys.CompanyName);
    const item = normKey(keys.itemName || keys.ItemName);

    const scored = [];
    for (const row of list) {
        const cur = pickCurrencyFromRow(row);
        if (!cur) continue;
        const rDept = normKey(row.DepartmentName || row.departmentName);
        const rCompany = normKey(row.CompanyName || row.companyName);
        const rItem = normKey(row.ItemName || row.itemName);
        let score = 0;
        if (item && rItem && item === rItem) score += 100;
        if (dept && rDept && dept === rDept) score += 40;
        if (company && rCompany && company === rCompany) score += 20;
        if (score > 0) scored.push({ score, cur });
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored.length) return scored[0].cur;

    // Company-only fallback (any row for that company with currency set)
    if (company) {
        const byCo = list.find((r) => normKey(r.CompanyName || r.companyName) === company && pickCurrencyFromRow(r));
        if (byCo) return pickCurrencyFromRow(byCo);
    }
    // Division-only fallback
    if (dept) {
        const byDept = list.find((r) => normKey(r.DepartmentName || r.departmentName) === dept && pickCurrencyFromRow(r));
        if (byDept) return pickCurrencyFromRow(byDept);
    }

    return DEFAULT_CURRENCY;
}

/**
 * Load Currency from DB for the given keys (uses live SQL pool helper).
 * @param {import('mssql')} sql
 * @param {{ departmentName?: string, companyName?: string, itemName?: string }} keys
 */
async function resolveCurrencyFromDb(sql, keys = {}) {
    try {
        const result = await sql.query`
            SELECT ItemName, CompanyName, DepartmentName, Currency
            FROM dbo.Master_EnquiryFor
            WHERE ISNULL(Status, N'Active') <> N'Inactive'
               OR Status IS NULL
        `;
        return resolveCurrencyFromMasterRows(result.recordset || [], keys);
    } catch (err) {
        console.warn('[masterCurrency] resolveCurrencyFromDb failed:', err?.message || err);
        return DEFAULT_CURRENCY;
    }
}

module.exports = {
    DEFAULT_CURRENCY,
    resolveCurrencyFromMasterRows,
    resolveCurrencyFromDb,
    pickCurrencyFromRow,
    normKey,
};
