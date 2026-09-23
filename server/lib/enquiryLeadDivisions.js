'use strict';

const { sql } = require('../dbConfig');
const { parseUserDepartments, formatUserDepartments } = require('./userDepartments');

/**
 * Lead jobs first, then other divisions — same order used by ED/CEO due emails.
 * @param {string} requestNo
 * @returns {Promise<string[]>}
 */
async function loadLeadDivisionNames(requestNo) {
    const res = await sql.query`
        SELECT
            EF.ID,
            EF.ParentID,
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

    const isLeadJob = (row) => {
        const p = row.ParentID;
        return p == null || p === '' || p === 0 || p === '0';
    };

    const divisionOf = (row) => String(row.DepartmentName || row.ItemName || '').trim();
    const leadNames = [];
    const otherNames = [];
    const seen = new Set();

    for (const row of res.recordset || []) {
        if (!isLeadJob(row)) continue;
        const division = divisionOf(row);
        if (!division) continue;
        const key = division.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        leadNames.push(division);
    }

    for (const row of res.recordset || []) {
        const division = divisionOf(row);
        if (!division) continue;
        const key = division.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        otherNames.push(division);
    }

    return [...leadNames, ...otherNames];
}

/**
 * Numbered multi-line Division label from enquiry lead/other jobs (legacy).
 * @param {string} requestNo
 * @param {object} [emailRow] — optional loadEnquiryEmailRow result for fallbacks
 * @returns {Promise<string>}
 */
async function resolveDueEmailDivisionLabel(requestNo, emailRow = null) {
    let divisions = await loadLeadDivisionNames(requestNo);
    if (!divisions.length && emailRow) {
        divisions = Array.isArray(emailRow.DivisionsInvolvedList)
            ? emailRow.DivisionsInvolvedList.filter(Boolean)
            : [];
    }
    if (!divisions.length && emailRow?.DivisionsInvolvedDisplay) {
        divisions = String(emailRow.DivisionsInvolvedDisplay)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }
    if (!divisions.length) return '';
    return divisions.map((name, i) => `${i + 1}. ${name}`).join('\n');
}

/**
 * Division of the enquiry creator (EnquiryMaster.CreatedBy → Master_ConcernedSE.Department).
 * Prefer Master_EnquiryFor.DepartmentName when a token matches.
 * @param {string} createdBy — EnquiryMaster.CreatedBy (FullName or email)
 * @returns {Promise<string>}
 */
async function resolveCreatedByDivisionLabel(createdBy) {
    const raw = String(createdBy || '').trim();
    if (!raw) return '';

    try {
        let seRes;
        if (raw.includes('@')) {
            const email = raw.toLowerCase();
            seRes = await sql.query`
                SELECT TOP 1 Department
                FROM Master_ConcernedSE
                WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, N'')))) = ${email}
            `;
        } else {
            seRes = await sql.query`
                SELECT TOP 1 Department
                FROM Master_ConcernedSE
                WHERE UPPER(LTRIM(RTRIM(ISNULL(FullName, N'')))) = UPPER(LTRIM(RTRIM(${raw})))
            `;
        }
        const department = String(seRes.recordset?.[0]?.Department || '').trim();
        if (!department) return '';

        const tokens = parseUserDepartments(department);
        if (!tokens.length) return '';

        const labels = [];
        for (const token of tokens) {
            const safe = token.replace(/%/g, '');
            const mefRes = await sql.query`
                SELECT TOP 1 DepartmentName, ItemName
                FROM Master_EnquiryFor
                WHERE LTRIM(RTRIM(ItemName)) = LTRIM(RTRIM(${token}))
                   OR LTRIM(RTRIM(DepartmentName)) = LTRIM(RTRIM(${token}))
                   OR LTRIM(RTRIM(ItemName)) LIKE ${'%' + safe + '%'}
                   OR LTRIM(RTRIM(DepartmentName)) LIKE ${'%' + safe + '%'}
                ORDER BY CASE
                    WHEN LTRIM(RTRIM(DepartmentName)) = LTRIM(RTRIM(${token})) THEN 0
                    WHEN LTRIM(RTRIM(ItemName)) = LTRIM(RTRIM(${token})) THEN 1
                    ELSE 2 END
            `;
            const mef = mefRes.recordset?.[0];
            labels.push(String(mef?.DepartmentName || mef?.ItemName || token).trim() || token);
        }
        return formatUserDepartments(labels);
    } catch (err) {
        console.warn('[enquiryLeadDivisions] resolveCreatedByDivisionLabel:', err?.message || err);
        return '';
    }
}

module.exports = {
    loadLeadDivisionNames,
    resolveDueEmailDivisionLabel,
    resolveCreatedByDivisionLabel,
};
