require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
// Load resolver by requiring probability routes module internals - duplicate logic inline

const { sql } = require('../dbConfig');

const normalizeUserEmail = (email) =>
    (email || '').toString().toLowerCase().trim().replace(/@almcg\.com$/i, '@almoayyedcg.com');
const norm = (s) => (s || '').toString().trim().toLowerCase();

async function resolveProbabilityDivisionScope(userEmail, requestedDivision = '') {
    const normalizedEmail = normalizeUserEmail(userEmail);
    if (!normalizedEmail) return null;

    const userRes = await sql.query`
        SELECT TOP 1 FullName, Roles, Department
        FROM Master_ConcernedSE
        WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${normalizedEmail}
    `;
    const baseUser = userRes.recordset?.[0] || {};
    const localPart = normalizedEmail.split('@')[0] || '';
    const localEmailPattern = `%${localPart}@%`;

    const ccReq = new sql.Request();
    ccReq.input('userEmail', sql.NVarChar, normalizedEmail);
    ccReq.input('localEmailPattern', sql.NVarChar, localEmailPattern);
    const ccRes = await ccReq.query(`
        SELECT DISTINCT LTRIM(RTRIM(ISNULL(mef.DepartmentName, ''))) AS DepartmentName
        FROM Master_EnquiryFor mef
        WHERE LTRIM(RTRIM(ISNULL(mef.DepartmentName, ''))) <> ''
          AND (
            ',' + REPLACE(REPLACE(LOWER(ISNULL(mef.CCMailIds, '')), ' ', ''), ';', ',') + ','
              LIKE '%,' + LOWER(LTRIM(RTRIM(ISNULL(@userEmail, '')))) + ',%'
            OR (
              @localEmailPattern <> '%@%'
              AND ',' + REPLACE(REPLACE(LOWER(ISNULL(mef.CCMailIds, '')), ' ', ''), ';', ',') + ','
                 LIKE '%,' + LOWER(LTRIM(RTRIM(ISNULL(@localEmailPattern, ''))))
            )
          )
        ORDER BY DepartmentName
    `);
    const ccDivisions = (ccRes.recordset || []).map((r) => String(r.DepartmentName || '').trim()).filter(Boolean);

    const nonCcDepartment = String(baseUser.Department || '').trim();
    const roleStr = String(baseUser.Roles || '').toLowerCase();
    const isAdmin = roleStr.includes('admin') || roleStr.includes('system');
    const isManagementDept = nonCcDepartment.toLowerCase() === 'management';
    const isCcUser = ccDivisions.length > 0 || isManagementDept || isAdmin;
    const isKnownProfileUser = !!String(baseUser.FullName || '').trim() || !!nonCcDepartment;
    if (!isKnownProfileUser && !isCcUser) return null;

    let divisions = [];
    if (isCcUser) {
        if (isManagementDept || isAdmin) {
            const allDivRes = await sql.query(`
                SELECT DISTINCT LTRIM(RTRIM(ISNULL(DepartmentName, ''))) AS DepartmentName
                FROM Master_EnquiryFor
                WHERE LTRIM(RTRIM(ISNULL(DepartmentName, ''))) <> ''
                ORDER BY DepartmentName
            `);
            divisions = (allDivRes.recordset || []).map((r) => String(r.DepartmentName || '').trim()).filter(Boolean);
        } else {
            divisions = ccDivisions;
        }
    } else {
        divisions = nonCcDepartment ? [nonCcDepartment] : [];
    }
    if (!divisions.length) return null;

    const reqDiv = String(requestedDivision || '').trim();
    const matchedRequestedDivision = reqDiv && divisions.find((d) => norm(d) === norm(reqDiv));
    const chosenDivision = reqDiv ? (matchedRequestedDivision || '') : divisions[0];
    if (!chosenDivision) return null;

    return { isCcUser, divisions, division: chosenDivision };
}

(async () => {
    await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE,
        options: { encrypt: false, trustServerCertificate: true },
    });
    const scope = await resolveProbabilityDivisionScope('mohan.naidu@almoayyedcg.com');
    console.log(JSON.stringify(scope, null, 2));
    await sql.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
