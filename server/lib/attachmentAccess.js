'use strict';

const { sql } = require('../dbConfig');
const {
    userHasDepartment,
    userHasManagementDepartment,
} = require('./userDepartments');

function normalizeAttachmentEmail(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com/g, '@almoayyedcg.com');
}

function normText(raw) {
    return String(raw || '').trim().toLowerCase();
}

function roleIsAdmin(roleString) {
    return String(roleString || '')
        .toLowerCase()
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .some((r) => r === 'admin' || r === 'system');
}

/**
 * Enquiry attachment access: assigned ConcernedSE + CCMailIds / Management / creator / Admin.
 * Same rules used by Enquiry Attachments and Quote Attachments.
 */
async function getAttachmentAccessContext(requestNo, rawUserEmail, userRole) {
    const email = normalizeAttachmentEmail(rawUserEmail);
    if (!email) return { allowed: false, reason: 'Missing userEmail', user: null, fullAccess: false };

    const isAdminFromRole = roleIsAdmin(userRole) || email === 'ranigovardhan@gmail.com';

    const userRes = await new sql.Request()
        .input('email', sql.NVarChar, email)
        .query(`
            SELECT TOP 1 FullName, Department, EmailId, Roles
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(EmailId, ''), '@almcg.com', '@almoayyedcg.com'), '@ALMCG.COM', '@almoayyedcg.com'))))
                  = LOWER(LTRIM(RTRIM(@email)))
        `);
    const user = userRes.recordset?.[0];
    if (!user && !isAdminFromRole) {
        return { allowed: false, reason: 'User not found', user: null, fullAccess: false };
    }

    const fullName = String(user?.FullName || '').trim();
    const department = String(user?.Department || '').trim();
    const isAdmin = isAdminFromRole || roleIsAdmin(user?.Roles);
    const isManagement = userHasManagementDepartment(department);

    const ccRes = await new sql.Request()
        .input('email', sql.NVarChar, email)
        .query(`
            SELECT TOP 1 1 AS ok
            FROM Master_EnquiryFor
            WHERE ',' + REPLACE(REPLACE(ISNULL(CCMailIds, ''), ' ', ''), ';', ',') + ','
                  LIKE '%,' + @email + ',%'
        `);
    const isCcUser = (ccRes.recordset || []).length > 0 || isManagement;

    const reqNo = String(requestNo || '').trim();
    const enqRes = await new sql.Request()
        .input('requestNo', sql.NVarChar, reqNo)
        .query(`
            SELECT TOP 1 CreatedBy
            FROM EnquiryMaster
            WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(@requestNo))
        `);
    const createdBy = String(enqRes.recordset?.[0]?.CreatedBy || '').trim();
    let isCreator = false;
    if (createdBy) {
        if (createdBy.includes('@')) {
            isCreator = normalizeAttachmentEmail(createdBy) === email;
        } else if (fullName) {
            isCreator = createdBy.toUpperCase().trim() === fullName.toUpperCase().trim();
        }
    }

    const assignedRes = await new sql.Request()
        .input('requestNo', sql.NVarChar, reqNo)
        .input('fullName', sql.NVarChar, fullName)
        .query(`
            SELECT TOP 1 1 AS ok
            FROM ConcernedSE
            WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(@requestNo))
              AND LOWER(LTRIM(RTRIM(ISNULL(SEName, '')))) = LOWER(LTRIM(RTRIM(ISNULL(@fullName, ''))))
        `);
    const isAssigned = (assignedRes.recordset || []).length > 0;

    const fullAccess = isAdmin || isCcUser || isCreator;
    const allowed = fullAccess || isAssigned;

    return {
        allowed,
        fullAccess,
        isAdmin,
        isCcUser,
        isCreator,
        isAssigned,
        reason: allowed ? null : 'Not assigned to enquiry',
        user: {
            fullName,
            department,
            email: normalizeAttachmentEmail(user?.EmailId || email),
        },
    };
}

function canReadAttachmentByVisibility(att, accessCtx) {
    if (!accessCtx?.allowed) return false;
    if (accessCtx.fullAccess || accessCtx.isAdmin) return true;

    const visibility = normText(att.Visibility || 'Public');
    if (visibility !== 'private') return true;

    const uploadedBy = normText(att.UploadedBy || '');
    const userName = normText(accessCtx.user?.fullName || '');
    if (uploadedBy && userName && uploadedBy === userName) return true;

    const attDivision = String(att.Division || '').trim();
    const userDept = String(accessCtx.user?.department || '').trim();
    if (!attDivision || !userDept) return false;
    return userHasDepartment(userDept, attDivision) || normText(attDivision) === normText(userDept);
}

module.exports = {
    normalizeAttachmentEmail,
    normText,
    roleIsAdmin,
    getAttachmentAccessContext,
    canReadAttachmentByVisibility,
};
