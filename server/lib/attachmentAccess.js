'use strict';

/**
 * Attachment visibility (Enquiry + Quote):
 *
 * Public  → assigned ConcernedSE + CCMailIds for jobs on this enquiry + Approvers + Admin
 * Private → own-job ConcernedSE (ownjob matches file Division) + CCMailIds for that
 *           division only + Approvers + Admin
 *           — nobody else (no uploader / Management / department fallbacks)
 */

const { sql } = require('../dbConfig');
const { userHasDepartment } = require('./userDepartments');

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

/** CC / Common mail list contains this user (domain + local-part). */
function ccMailIdsContainsUser(ccMailIdsStr, userEmail) {
    const e = normalizeAttachmentEmail(userEmail);
    if (!e) return false;
    const raw = String(ccMailIdsStr || '').replace(/@almcg\.com/gi, '@almoayyedcg.com');
    const list = `,${raw.replace(/\s/g, '').replace(/;/g, ',').toLowerCase()},`;
    if (list.includes(`,${e},`)) return true;
    const local = e.split('@')[0];
    return local.length > 0 && list.includes(`,${local},`);
}

function divisionLabelsMatch(userLabel, targetLabel) {
    const a = String(userLabel || '').trim();
    const b = String(targetLabel || '').trim();
    if (!a || !b) return false;
    return userHasDepartment(a, b) || normText(a) === normText(b);
}

function userMatchesAnyDivision(userLabels, targetDivision) {
    const target = String(targetDivision || '').trim();
    if (!target) return false;
    return (userLabels || []).some((lab) => divisionLabelsMatch(lab, target));
}

function emptyAccess(reason) {
    return {
        allowed: false,
        reason,
        user: null,
        isAdmin: false,
        isAssigned: false,
        isCcUser: false,
        isApprover: false,
        canSeePublic: false,
        canSeePrivate: false,
        assignedOwnJobs: [],
        ccDivisions: [],
        fullAccess: false,
    };
}

/**
 * Build access context for an enquiry's attachments.
 * @param {string} requestNo
 * @param {string} rawUserEmail
 * @param {string} [userRole]
 */
async function getAttachmentAccessContext(requestNo, rawUserEmail, userRole) {
    const email = normalizeAttachmentEmail(rawUserEmail);
    if (!email) return emptyAccess('Missing userEmail');

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
    if (!user && !isAdminFromRole) return emptyAccess('User not found');

    const fullName = String(user?.FullName || '').trim();
    const department = String(user?.Department || '').trim();
    // Strict Admin / System only — Management is NOT blanket private access
    const isAdmin = isAdminFromRole || roleIsAdmin(user?.Roles);

    const reqNo = String(requestNo || '').trim();

    // --- Assigned ConcernedSE (ownjob drives Private scope) ---
    const assignedRes = await new sql.Request()
        .input('requestNo', sql.NVarChar, reqNo)
        .input('fullName', sql.NVarChar, fullName)
        .input('email', sql.NVarChar, email)
        .query(`
            SELECT ownjob, SEName, emailID
            FROM ConcernedSE
            WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(@requestNo))
              AND (
                    LOWER(LTRIM(RTRIM(ISNULL(SEName, '')))) = LOWER(LTRIM(RTRIM(ISNULL(@fullName, ''))))
                 OR LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(emailID, ''), '@almcg.com', '@almoayyedcg.com'), '@ALMCG.COM', '@almoayyedcg.com'))))
                    = LOWER(LTRIM(RTRIM(@email)))
              )
        `);
    const assignedRows = assignedRes.recordset || [];
    const isAssigned = assignedRows.length > 0;
    const assignedOwnJobs = [
        ...new Set(assignedRows.map((r) => String(r.ownjob || '').trim()).filter(Boolean)),
    ];

    // --- CCMailIds for jobs present on this enquiry (scoped by division for Private) ---
    const jobsCcRes = await new sql.Request()
        .input('requestNo', sql.NVarChar, reqNo)
        .query(`
            SELECT DISTINCT
                LTRIM(RTRIM(ISNULL(EF.ItemName, N''))) AS ItemName,
                LTRIM(RTRIM(ISNULL(EF.LeadJobName, N''))) AS LeadJobName,
                LTRIM(RTRIM(ISNULL(MEF.DepartmentName, N''))) AS DepartmentName,
                MEF.CCMailIds
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF
                ON LTRIM(RTRIM(ISNULL(MEF.ItemName, N''))) = LTRIM(RTRIM(ISNULL(EF.ItemName, N'')))
                OR LTRIM(RTRIM(ISNULL(MEF.DepartmentName, N''))) = LTRIM(RTRIM(ISNULL(EF.ItemName, N'')))
            WHERE LTRIM(RTRIM(EF.RequestNo)) = LTRIM(RTRIM(@requestNo))
        `);

    const ccDivisions = [];
    let isCcUser = false;
    for (const row of jobsCcRes.recordset || []) {
        if (!ccMailIdsContainsUser(row.CCMailIds, email)) continue;
        isCcUser = true;
        for (const lab of [row.DepartmentName, row.ItemName, row.LeadJobName]) {
            const t = String(lab || '').trim();
            if (t && !ccDivisions.some((x) => normText(x) === normText(t))) {
                ccDivisions.push(t);
            }
        }
    }

    // --- Approvers (QuoteApprovalSteps for this RequestNo) ---
    let isApprover = false;
    try {
        const apprRes = await new sql.Request()
            .input('requestNo', sql.NVarChar, reqNo)
            .input('email', sql.NVarChar, email)
            .query(`
                SELECT TOP 1 1 AS ok
                FROM QuoteApprovalSteps
                WHERE LTRIM(RTRIM(ISNULL(RequestNo, N''))) = LTRIM(RTRIM(@requestNo))
                  AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(ApproverEmail, N''), '@almcg.com', '@almoayyedcg.com'), '@ALMCG.COM', '@almoayyedcg.com'))))
                      = LOWER(LTRIM(RTRIM(@email)))
            `);
        isApprover = (apprRes.recordset || []).length > 0;
    } catch (_) {
        isApprover = false;
    }

    const canSeePublic = isAdmin || isAssigned || isCcUser || isApprover;
    // Private audience (API gate): admin, approver, own-job assigned, or CC on any enquiry job
    // (per-file Division still enforced in canReadAttachmentByVisibility)
    const canSeePrivate =
        isAdmin ||
        isApprover ||
        (isAssigned && assignedOwnJobs.length > 0) ||
        (isCcUser && ccDivisions.length > 0);
    const allowed = canSeePublic || canSeePrivate;

    return {
        allowed,
        fullAccess: isAdmin,
        isAdmin,
        isCcUser,
        isAssigned,
        isApprover,
        canSeePublic,
        canSeePrivate,
        assignedOwnJobs,
        ccDivisions,
        reason: allowed ? null : 'Not assigned to enquiry',
        user: {
            fullName,
            department,
            email: normalizeAttachmentEmail(user?.EmailId || email),
        },
    };
}

/**
 * Per-file filter after Gate A (allowed).
 *
 * Public  → assigned ConcernedSE | CC on enquiry jobs | Approvers | Admin
 * Private → own-job ConcernedSE (ownjob ≡ Division) | CC for that Division | Approvers | Admin
 *           — no other paths
 */
function canReadAttachmentByVisibility(att, accessCtx) {
    if (!accessCtx?.allowed) return false;
    if (accessCtx.isAdmin) return true;

    const visibility = normText(att.Visibility || 'Public');
    const isPrivate = visibility === 'private';

    // Approvers: Public + Private for this enquiry
    if (accessCtx.isApprover) return true;

    if (!isPrivate) {
        return !!(accessCtx.isAssigned || accessCtx.isCcUser);
    }

    // --- Private only ---
    const attDivision = String(att.Division || '').trim();
    if (!attDivision) return false;

    // Own-job ConcernedSE only (must match ConcernedSE.ownjob ↔ file Division)
    if (
        accessCtx.isAssigned &&
        userMatchesAnyDivision(accessCtx.assignedOwnJobs, attDivision)
    ) {
        return true;
    }

    // CCMailIds users only for the same division as the file
    if (userMatchesAnyDivision(accessCtx.ccDivisions, attDivision)) {
        return true;
    }

    return false;
}

module.exports = {
    normalizeAttachmentEmail,
    normText,
    roleIsAdmin,
    ccMailIdsContainsUser,
    getAttachmentAccessContext,
    canReadAttachmentByVisibility,
};
