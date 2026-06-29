/**
 * Load EnquiryMaster + related rows for notification / Outlook draft email.
 */
const { sql } = require('../dbConfig');

function uniqueStrings(values) {
    const seen = new Set();
    const out = [];
    for (const raw of values || []) {
        const v = String(raw || '').trim();
        if (!v) continue;
        const key = v.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
    }
    return out;
}

function formatNumberedList(names) {
    return uniqueStrings(names)
        .map((name, i) => `${String(i + 1).padStart(2, '0')}. ${name}`)
        .join(', ');
}

function splitDelimitedNames(raw) {
    const s = String(raw || '').trim();
    if (!s) return [];
    if (/\d{2}\.\s/.test(s)) {
        return s
            .split(/,\s*(?=\d{2}\.\s)/)
            .map((part) => part.replace(/^\d{2}\.\s*/, '').trim())
            .filter(Boolean);
    }
    return s
        .split(/,\s*/)
        .map((part) => part.trim())
        .filter(Boolean);
}

/**
 * @param {string} requestNo
 * @returns {Promise<object|null>}
 */
async function loadEnquiryEmailRow(requestNo) {
    const reqNo = String(requestNo || '').trim();
    const enqRes = await sql.query`SELECT * FROM EnquiryMaster WHERE RequestNo = ${reqNo}`;
    if (!enqRes.recordset?.length) return null;
    const row = enqRes.recordset[0];

    const typesRes = await sql.query`
        SELECT TypeName FROM EnquiryType WHERE RequestNo = ${reqNo} ORDER BY ID
    `;
    row.EnquiryTypeDisplay = uniqueStrings((typesRes.recordset || []).map((r) => r.TypeName)).join(', ');

    const forRes = await sql.query`
        SELECT ItemName FROM EnquiryFor WHERE RequestNo = ${reqNo} ORDER BY ID
    `;
    const divisionNames = uniqueStrings((forRes.recordset || []).map((r) => r.ItemName));
    row.DivisionsInvolvedList = divisionNames;
    row.DivisionsInvolvedDisplay = divisionNames.join(', ');

    const custRes = await sql.query`
        SELECT CustomerName FROM EnquiryCustomer WHERE RequestNo = ${reqNo} ORDER BY ID
    `;
    const customerNames = uniqueStrings((custRes.recordset || []).map((r) => r.CustomerName));
    row.CustomerNamesList = customerNames;
    row.CustomerNameDisplay = formatNumberedList(customerNames) || String(row.CustomerName || '').trim();

    const consultRes = await sql.query`
        SELECT ConsultantName FROM EnquiryConsultant WHERE RequestNo = ${reqNo} ORDER BY ID
    `;
    let consultantNames = uniqueStrings((consultRes.recordset || []).map((r) => r.ConsultantName));
    if (!consultantNames.length && row.ConsultantName) {
        consultantNames = uniqueStrings(splitDelimitedNames(row.ConsultantName));
    }
    row.ConsultantNamesList = consultantNames;

    return row;
}

module.exports = {
    loadEnquiryEmailRow,
    uniqueStrings,
    formatNumberedList,
    splitDelimitedNames,
};
