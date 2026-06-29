/**
 * Dashboard CC-mail / Management / Admin helpers.
 * Management + Admin users get coordinator-style division + SE filters (like lohidas@almoayyedcg.com).
 */

/** CC coordinators excluded from Enquiry For Structure SE/EE/QS picker (mirrors server notification exclusions). */
const EXCLUDED_ENQUIRY_STRUCTURE_CC_EMAILS = new Set([
    'lohidas@almoayyedcg.com',
    'mathews@almoayyedcg.com',
    'hala@almoayyedcg.com',
]);

function normalizeCcEmail(email) {
    return String(email || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com$/i, '@almoayyedcg.com');
}

function normalizeDivisionKey(label) {
    return String(label || '')
        .replace(/^L\d+\s*-\s*/i, '')
        .trim()
        .toLowerCase();
}

/** Match one Master_EnquiryFor row to a structure division label (ItemName / DepartmentName). */
function masterEnquiryForMatchesDivision(masterRow, divisionLabel) {
    const divKey = normalizeDivisionKey(divisionLabel);
    if (!divKey) return false;
    const itemKey = normalizeDivisionKey(masterRow?.ItemName);
    const deptKey = normalizeDivisionKey(masterRow?.DepartmentName);
    if (itemKey && divKey === itemKey) return true;
    if (deptKey && divKey === deptKey) return true;
    const rawDiv = String(divisionLabel || '').trim().toLowerCase();
    if (itemKey) {
        if (rawDiv === itemKey) return true;
        if (rawDiv.endsWith(` - ${itemKey}`) || rawDiv.endsWith(`- ${itemKey}`)) return true;
        if (rawDiv.startsWith(`${itemKey} `)) return true;
    }
    return false;
}

/** Distinct CCMailIds from Master_EnquiryFor for one division, minus excluded coordinator addresses. */
export function collectDistinctCcMailIdsForDivision(divisionLabel, enqItems) {
    const seen = new Set();
    const out = [];
    for (const item of enqItems || []) {
        if (!masterEnquiryForMatchesDivision(item, divisionLabel)) continue;
        for (const raw of String(item.CCMailIds || '').split(/[,;]/)) {
            const norm = normalizeCcEmail(raw);
            if (!norm || EXCLUDED_ENQUIRY_STRUCTURE_CC_EMAILS.has(norm) || seen.has(norm)) continue;
            seen.add(norm);
            out.push(norm);
        }
    }
    return out;
}

/** Distinct CCMailIds from all Master_EnquiryFor rows, minus excluded coordinator addresses. */
export function collectDistinctCcMailIds(enqItems) {
    const seen = new Set();
    const out = [];
    for (const item of enqItems || []) {
        for (const raw of String(item.CCMailIds || '').split(/[,;]/)) {
            const norm = normalizeCcEmail(raw);
            if (!norm || EXCLUDED_ENQUIRY_STRUCTURE_CC_EMAILS.has(norm) || seen.has(norm)) continue;
            seen.add(norm);
            out.push(norm);
        }
    }
    return out;
}

function mapCcEmailsToAssigneeUsers(emails, masterUsers) {
    const userByEmail = new Map(
        (masterUsers || [])
            .map((u) => [normalizeCcEmail(u.EmailId ?? u.email), u])
            .filter(([email]) => Boolean(email))
    );
    const result = [];
    const seenNames = new Set();
    for (const email of emails) {
        const u = userByEmail.get(email);
        const fullName = String(u?.FullName ?? u?.fullName ?? '').trim();
        if (!fullName) continue;
        const nameKey = fullName.toLowerCase();
        if (seenNames.has(nameKey)) continue;
        seenNames.add(nameKey);
        result.push(u);
    }
    return result;
}

function divisionMatchKeys(divisionLabel) {
    const stripped = normalizeDivisionKey(divisionLabel);
    const keys = new Set([stripped]);
    const parts = stripped.split(' - ').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) keys.add(parts[parts.length - 1]);
    return [...keys].filter(Boolean);
}

/** Master_ConcernedSE rows whose Department matches the structure division label. */
function userDepartmentMatchesDivision(userDept, divisionLabel) {
    const d = normalizeDivisionKey(userDept);
    if (!d) return false;
    return divisionMatchKeys(divisionLabel).some((k) => {
        if (d === k) return true;
        return k.includes(d) || d.includes(k);
    });
}

export function getConcernedSeUsersForDivision(divisionLabel, masterUsers) {
    return (masterUsers || []).filter((u) =>
        userDepartmentMatchesDivision(u?.Department ?? u?.department, divisionLabel)
    );
}

function mergeAssigneeUsers(...groups) {
    const seen = new Set();
    const result = [];
    for (const group of groups) {
        for (const u of group || []) {
            const fullName = String(u?.FullName ?? u?.fullName ?? '').trim();
            if (!fullName) continue;
            const key = fullName.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(u);
        }
    }
    return result.sort((a, b) =>
        String(a.FullName ?? a.fullName ?? '').localeCompare(String(b.FullName ?? b.fullName ?? ''))
    );
}

/**
 * Enquiry For Structure assignees for one division:
 * Concerned SE (Master_ConcernedSE by department) plus CC-mail users for that division.
 */
export function getEnquiryStructureAssigneeUsersForDivision(divisionLabel, enqItems, masterUsers) {
    const concerned = getConcernedSeUsersForDivision(divisionLabel, masterUsers);
    const ccUsers = mapCcEmailsToAssigneeUsers(
        collectDistinctCcMailIdsForDivision(divisionLabel, enqItems),
        masterUsers
    );
    return mergeAssigneeUsers(concerned, ccUsers);
}

/**
 * Master_ConcernedSE rows for Enquiry For Structure assignee dropdown:
 * all distinct CC-mail users across Master_EnquiryFor, excluding coordinator exclusions.
 */
export function getEnquiryStructureAssigneeUsers(enqItems, masterUsers) {
    return mergeAssigneeUsers(
        mapCcEmailsToAssigneeUsers(collectDistinctCcMailIds(enqItems), masterUsers)
    );
}

function parseUserRoles(currentUser) {
    const roleString = currentUser?.role || currentUser?.Roles || '';
    if (typeof roleString === 'string') {
        return roleString.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
    }
    if (Array.isArray(roleString)) {
        return roleString.map((r) => String(r).trim().toLowerCase()).filter(Boolean);
    }
    return [];
}

export function isAdminRole(currentUser) {
    const roles = parseUserRoles(currentUser);
    return roles.includes('admin') || roles.includes('system');
}

export function isManagementDepartmentUser(currentUser) {
    const d = String(currentUser?.Department || currentUser?.DivisionName || '').trim().toLowerCase();
    return d === 'management';
}

/** True if logged-in user's email appears on any Master_EnquiryFor.CCMailIds */
export function isCcMailUser(userEmail, enqItems) {
    const e = String(userEmail || '').trim().toLowerCase();
    if (!e) return false;
    return (enqItems || []).some((item) => {
        const cc = String(item.CCMailIds || '')
            .split(/[,;]/)
            .map((x) => x.trim().toLowerCase())
            .filter(Boolean);
        return cc.includes(e);
    });
}

/** Admin, Management department, or CC-mail coordinator — division/SE pickers enabled with coordinator behaviour. */
export function isDashboardCoordinatorUser(currentUser, enqItems) {
    if (isAdminRole(currentUser) || isManagementDepartmentUser(currentUser)) return true;
    const email = currentUser?.email || currentUser?.EmailId || '';
    return isCcMailUser(email, enqItems);
}

/** Distinct Master_EnquiryFor.DepartmentName values (dashboard division dropdown). */
export function getAllMasterDepartmentNames(enqItems) {
    return Array.from(
        new Set(
            (enqItems || [])
                .map((item) => String(item.DepartmentName || '').trim())
                .filter(Boolean)
        )
    );
}

/** CC-linked departments for this email only (non-management CC coordinators). */
export function getCcDepartmentNamesForUser(userEmail, enqItems) {
    const email = String(userEmail || '').trim().toLowerCase();
    if (!email) return [];
    const depts = (enqItems || [])
        .filter((item) => {
            const cc = String(item.CCMailIds || '')
                .split(/[,;]/)
                .map((x) => x.trim().toLowerCase())
                .filter(Boolean);
            return cc.includes(email);
        })
        .map((item) => String(item.DepartmentName || '').trim())
        .filter(Boolean);
    return Array.from(new Set(depts));
}

/** Resolve Master_ConcernedSE row for the logged-in user. */
export function findMasterUserByEmail(currentUser, masterUsers) {
    const email = String(currentUser?.email || currentUser?.EmailId || '').trim().toLowerCase();
    if (!email) return null;
    return (
        (masterUsers || []).find(
            (x) => String(x.EmailId ?? x.email ?? '').trim().toLowerCase() === email
        ) || null
    );
}

/** Regular SE (not admin / management / CC): fixed dashboard division from profile or master. */
export function getRegularUserDashboardDivision(currentUser, masterUsers) {
    const fromProfile = String(currentUser?.Department || currentUser?.DivisionName || '').trim();
    if (fromProfile) return fromProfile;
    const u = findMasterUserByEmail(currentUser, masterUsers);
    return String(u?.Department ?? '').trim() || '';
}

/** Regular SE: fixed dashboard SE filter value (FullName). */
export function getRegularUserDashboardSeName(currentUser, masterUsers) {
    const fromProfile = String(currentUser?.name || currentUser?.FullName || '').trim();
    if (fromProfile) return fromProfile;
    const u = findMasterUserByEmail(currentUser, masterUsers);
    return String(u?.FullName ?? u?.fullName ?? '').trim() || '';
}

/** Locked division / SE values for non-coordinator dashboard users. */
export function getRegularUserDashboardFilterDefaults(currentUser, masterUsers) {
    return {
        division: getRegularUserDashboardDivision(currentUser, masterUsers),
        salesEngineer: getRegularUserDashboardSeName(currentUser, masterUsers),
    };
}

/**
 * Division options for the dashboard dropdown.
 * Admin / Management → all departments; CC → CC-linked departments; else user's department only.
 */
export function getDashboardDivisionOptions(currentUser, enqItems, enquiryFor, masterUsers) {
    if (isAdminRole(currentUser) || isManagementDepartmentUser(currentUser)) {
        return getAllMasterDepartmentNames(enqItems);
    }
    const email = currentUser?.email || currentUser?.EmailId || '';
    if (isCcMailUser(email, enqItems)) {
        const ccDepts = getCcDepartmentNamesForUser(email, enqItems);
        return ccDepts.length > 0 ? ccDepts : ['All'];
    }
    const dept = getRegularUserDashboardDivision(currentUser, masterUsers);
    if (dept) return [dept];
    return enquiryFor || [];
}

/**
 * Division string used for SE list + CC coordinator lookup (matches DashboardFilters behaviour).
 * Coordinator + "All" divisions → ''. CC user + empty division → first CC-linked department from master.
 */
export function getEffectiveDivisionForDashboardSe(filtersDivision, currentUser, enqItems) {
    const fd = String(filtersDivision || '').trim();
    if (fd && fd.toLowerCase() !== 'all') return fd;

    if (isAdminRole(currentUser) || isManagementDepartmentUser(currentUser)) {
        return '';
    }

    const email = String(currentUser?.email || currentUser?.EmailId || '').trim().toLowerCase();
    if (!isCcMailUser(email, enqItems)) return '';

    const ccDepts = getCcDepartmentNamesForUser(email, enqItems);
    return ccDepts[0] || '';
}

/**
 * Full names from Master_ConcernedSE (`masters.users`) whose Department equals the selected division.
 * When division is empty or All → every distinct FullName (coordinator “all divisions”, or before a pick).
 */
export function getMasterConcernedSeNamesForDivision(division, masterUsers) {
    const rows = masterUsers || [];
    const allNames = Array.from(
        new Set(rows.map((u) => String(u.FullName ?? u.fullName ?? '').trim()).filter(Boolean))
    );
    if (!division || String(division).trim() === '' || String(division).trim().toLowerCase() === 'all') {
        return allNames;
    }
    const d = String(division).trim().toLowerCase();
    return Array.from(
        new Set(
            rows
                .filter((u) => String(u.Department ?? '').trim().toLowerCase() === d)
                .map((u) => String(u.FullName ?? u.fullName ?? '').trim())
                .filter(Boolean)
        )
    );
}

/**
 * CC mails from Master_EnquiryFor for this department → FullName, kept only when Master_ConcernedSE.Department matches `division`.
 */
export function getCcCoordinatorNamesForDivision(division, enqItems, users) {
    if (!division || String(division).trim() === '' || String(division).trim().toLowerCase() === 'all') {
        return [];
    }
    const divLower = String(division).trim().toLowerCase();
    const emailSet = new Set();
    for (const item of enqItems || []) {
        const dn = String(item.DepartmentName ?? '').trim().toLowerCase();
        if (dn !== divLower) continue;
        String(item.CCMailIds || '')
            .split(/[,;]/)
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean)
            .forEach((e) => emailSet.add(e));
    }
    const names = new Set();
    for (const email of emailSet) {
        const u = (users || []).find(
            (x) => String(x.EmailId ?? x.email ?? '').trim().toLowerCase() === email
        );
        const fn = u?.FullName ?? u?.fullName;
        if (!fn || !String(fn).trim()) continue;
        const dept = String(u.Department ?? '').trim().toLowerCase();
        if (dept !== divLower) continue;
        names.add(String(fn).trim());
    }
    return [...names];
}

export function isCcCoordinatorNameSelection(selectedName, division, enqItems, users) {
    if (!selectedName || selectedName === 'All') return false;
    const coordinators = getCcCoordinatorNamesForDivision(division, enqItems, users);
    const sel = String(selectedName).trim().toLowerCase();
    return coordinators.some((n) => n.trim().toLowerCase() === sel);
}

/**
 * Returns API salesEngineer param: 'All' when a CC coordinator display name is chosen, else the raw selection.
 */
export function resolveEffectiveSalesEngineerFilter({
    salesEngineer,
    division,
    enqItems,
    users,
    currentUserEmail,
    currentUser,
}) {
    const user = currentUser || { email: currentUserEmail, EmailId: currentUserEmail };
    const effectiveDiv = getEffectiveDivisionForDashboardSe(division, user, enqItems);
    if (isCcCoordinatorNameSelection(salesEngineer, effectiveDiv, enqItems, users)) {
        return 'All';
    }
    return salesEngineer;
}
