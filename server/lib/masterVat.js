'use strict';

/**
 * Resolve Master_EnquiryFor.VAT_Per for a company / division / ItemName.
 * Fallback: SAR → 15, else 10 (legacy currency-based defaults).
 */

const { resolveCurrencyFromMasterRows, DEFAULT_CURRENCY } = require('./masterCurrency');

function vatPercentForCurrency(currencyCode) {
    const code = String(currencyCode || DEFAULT_CURRENCY)
        .trim()
        .toUpperCase();
    if (code === 'SAR') return 15;
    return 10;
}

function pickVatFromRow(row) {
    const raw = row?.VAT_Per ?? row?.vat_Per ?? row?.Vat_Per ?? row?.vatPer;
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 10000) / 10000;
}

function normKey(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/^(l\d+|sub job)\s*-\s*/i, '')
        .replace(/[^a-z0-9]+/g, '');
}

/**
 * @param {object[]} rows Master_EnquiryFor recordset
 * @param {{ departmentName?: string, companyName?: string, itemName?: string, division?: string }} keys
 * @returns {number|null} VAT percent from master, or null if unset on matched rows
 */
function resolveVatPercentFromMasterRows(rows, keys = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const dept = normKey(keys.departmentName || keys.division || keys.DepartmentName);
    const company = normKey(keys.companyName || keys.CompanyName);
    const item = normKey(keys.itemName || keys.ItemName);

    const scored = [];
    for (const row of list) {
        const vat = pickVatFromRow(row);
        if (vat == null) continue;
        const rDept = normKey(row.DepartmentName || row.departmentName);
        const rCompany = normKey(row.CompanyName || row.companyName);
        const rItem = normKey(row.ItemName || row.itemName);
        let score = 0;
        if (item && rItem && item === rItem) score += 100;
        if (dept && rDept && dept === rDept) score += 40;
        if (company && rCompany && company === rCompany) score += 20;
        if (score > 0) scored.push({ score, vat });
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored.length) return scored[0].vat;

    if (company) {
        const byCo = list.find(
            (r) => normKey(r.CompanyName || r.companyName) === company && pickVatFromRow(r) != null,
        );
        if (byCo) return pickVatFromRow(byCo);
    }
    if (dept) {
        const byDept = list.find(
            (r) =>
                normKey(r.DepartmentName || r.departmentName) === dept && pickVatFromRow(r) != null,
        );
        if (byDept) return pickVatFromRow(byDept);
    }
    return null;
}

/**
 * Resolve VAT % for keys: Master_EnquiryFor.VAT_Per, else currency-based default.
 */
async function resolveVatPercentFromDb(sql, keys = {}) {
    try {
        const result = await sql.query`
            SELECT ItemName, CompanyName, DepartmentName, Currency, VAT_Per
            FROM dbo.Master_EnquiryFor
            WHERE ISNULL(Status, N'Active') <> N'Inactive'
               OR Status IS NULL
        `;
        const rows = result.recordset || [];
        const fromMaster = resolveVatPercentFromMasterRows(rows, keys);
        if (fromMaster != null) return fromMaster;
        const currency = resolveCurrencyFromMasterRows(rows, keys);
        return vatPercentForCurrency(currency);
    } catch (err) {
        console.warn('[masterVat] resolveVatPercentFromDb failed:', err?.message || err);
        return vatPercentForCurrency(DEFAULT_CURRENCY);
    }
}

module.exports = {
    vatPercentForCurrency,
    pickVatFromRow,
    resolveVatPercentFromMasterRows,
    resolveVatPercentFromDb,
    normKey,
};
