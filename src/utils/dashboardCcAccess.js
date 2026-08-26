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

function parseCcMailList(ccMailIds) {
    if (Array.isArray(ccMailIds)) {
        return ccMailIds.map((s) => String(s || '').trim()).filter(Boolean);
    }
    return String(ccMailIds || '')
        .split(/[,;]/)
        .map((s) => String(s || '').trim())
        .filter(Boolean);
}

/** Distinct CCMailIds from Master_EnquiryFor for one division, minus excluded coordinator addresses. */
export function collectDistinctCcMailIdsForDivision(divisionLabel, enqItems) {
    const seen = new Set();
    const out = [];
    for (const item of enqItems || []) {
        if (!masterEnquiryForMatchesDivision(item, divisionLabel)) continue;
        for (const raw of parseCcMailList(item.CCMailIds)) {
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
        for (const raw of parseCcMailList(item.CCMailIds)) {
            const norm = normalizeCcEmail(raw);
            if (!norm || EXCLUDED_ENQUIRY_STRUCTURE_CC_EMAILS.has(norm) || seen.has(norm)) continue;
            seen.add(norm);
            out.push(norm);
        }
    }
    return out;
}

function ccEmailToDisplayLabel(email) {
    const norm = normalizeCcEmail(email);
    if (!norm) return '';
    const local = norm.split('@')[0] || norm;
    return local
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

/** Map division CC emails to assignee rows; unresolved emails still appear using a readable label. */
function mapCcEmailsToAssigneeUsers(emails, masterUsers) {
    const userByEmail = new Map(
        (masterUsers || [])
            .map((u) => [normalizeCcEmail(u.EmailId ?? u.email), u])
            .filter(([email]) => Boolean(email))
    );
    const result = [];
    const seenEmails = new Set();
    for (const email of emails || []) {
        const norm = normalizeCcEmail(email);
        if (!norm || seenEmails.has(norm)) continue;
        seenEmails.add(norm);

        const master = userByEmail.get(norm);
        const fullName = master
            ? String(master.FullName ?? master.fullName ?? '').trim()
            : ccEmailToDisplayLabel(norm);
        if (!fullName) continue;

        result.push(
            master
                ? { ...master, assigneeSource: 'ccMail' }
                : { FullName: fullName, EmailId: norm, assigneeSource: 'ccMail' }
        );
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

/** Department keys used to resolve Master_ConcernedSE for one structure division label. */
function divisionAssigneeDepartmentKeys(divisionLabel, enqItems) {
    const keys = new Set(divisionMatchKeys(divisionLabel));
    for (const item of enqItems || []) {
        if (!masterEnquiryForMatchesDivision(item, divisionLabel)) continue;
        const deptKey = normalizeDivisionKey(item?.DepartmentName);
        const itemKey = normalizeDivisionKey(item?.ItemName);
        if (deptKey) keys.add(deptKey);
        if (itemKey) keys.add(itemKey);
    }
    return [...keys].filter(Boolean);
}

/** Master_ConcernedSE rows whose Department matches the structure division label (exact match only). */
function userDepartmentMatchesDivision(userDept, divisionLabel, enqItems) {
    const d = normalizeDivisionKey(userDept);
    if (!d) return false;
    return divisionAssigneeDepartmentKeys(divisionLabel, enqItems).some((k) => d === k);
}

export function getConcernedSeUsersForDivision(divisionLabel, masterUsers, enqItems = []) {
    return (masterUsers || []).filter((u) =>
        userDepartmentMatchesDivision(u?.Department ?? u?.department, divisionLabel, enqItems)
    );
}

function mergeAssigneeUsers(...groups) {
    const seen = new Set();
    const result = [];
    for (const group of groups) {
        for (const u of group || []) {
            const fullName = String(u?.FullName ?? u?.fullName ?? '').trim();
            if (!fullName) continue;
            const emailKey = normalizeCcEmail(u?.EmailId ?? u?.email);
            const key = emailKey || fullName.toLowerCase();
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
    const concerned = getConcernedSeUsersForDivision(divisionLabel, masterUsers, enqItems);
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
 * Division string used for single-division SE / CC coordinator lookup.
 * Explicit "All" → '' (caller should use allowed-division union helpers instead).
 * CC user + empty division → first CC-linked department (legacy fallback).
 */
export function getEffectiveDivisionForDashboardSe(filtersDivision, currentUser, enqItems) {
    const fd = String(filtersDivision || '').trim();
    if (fd && fd.toLowerCase() !== 'all') return fd;

    if (fd.toLowerCase() === 'all') return '';

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
 * Empty / All → [] (use {@link getMasterConcernedSeNamesForDivisions} with allowed departments).
 */
export function getMasterConcernedSeNamesForDivision(division, masterUsers) {
    if (!division || String(division).trim() === '' || String(division).trim().toLowerCase() === 'all') {
        return [];
    }
    const d = String(division).trim().toLowerCase();
    return Array.from(
        new Set(
            (masterUsers || [])
                .filter((u) => String(u.Department ?? '').trim().toLowerCase() === d)
                .map((u) => String(u.FullName ?? u.fullName ?? '').trim())
                .filter(Boolean)
        )
    );
}

/** Union of Master_ConcernedSE FullNames across multiple department labels. */
export function getMasterConcernedSeNamesForDivisions(divisions, masterUsers) {
    const names = new Set();
    for (const div of divisions || []) {
        for (const n of getMasterConcernedSeNamesForDivision(div, masterUsers)) {
            names.add(n);
        }
    }
    return [...names];
}

/**
 * SE dropdown names for the current dashboard division filter.
 * "All Divisions" → SEs in the user's allowed departments only (not company-wide).
 */
export function getDashboardSeNamesForFilter(filtersDivision, currentUser, enqItems, masterUsers, enquiryFor = []) {
    const fd = String(filtersDivision || '').trim();
    const allowedDivisions = getDashboardDivisionOptions(
        currentUser,
        enqItems,
        enquiryFor,
        masterUsers
    ).filter((d) => d && String(d).trim().toLowerCase() !== 'all');

    if (!fd || fd.toLowerCase() === 'all') {
        return getMasterConcernedSeNamesForDivisions(allowedDivisions, masterUsers);
    }

    return getMasterConcernedSeNamesForDivision(fd, masterUsers);
}

/** CC coordinator FullNames across one or more departments. */
export function getCcCoordinatorNamesForDivisions(divisions, enqItems, users) {
    const names = new Set();
    for (const div of divisions || []) {
        for (const n of getCcCoordinatorNamesForDivision(div, enqItems, users)) {
            names.add(n);
        }
    }
    return [...names];
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

export function isCcCoordinatorNameSelection(selectedName, division, enqItems, users, allowedDivisions = null) {
    if (!selectedName || selectedName === 'All') return false;
    const sel = String(selectedName).trim().toLowerCase();
    const div = String(division || '').trim();
    const divisions =
        !div || div.toLowerCase() === 'all'
            ? (allowedDivisions || []).filter((d) => d && String(d).trim().toLowerCase() !== 'all')
            : [div];
    if (divisions.length === 0) {
        const coordinators = getCcCoordinatorNamesForDivision(div, enqItems, users);
        return coordinators.some((n) => n.trim().toLowerCase() === sel);
    }
    return getCcCoordinatorNamesForDivisions(divisions, enqItems, users).some(
        (n) => n.trim().toLowerCase() === sel
    );
}

/**
 * API salesEngineer param — always the selected name (or All).
 * Do not remap CC-mail names to All: many SEs are also on CCMailIds; selecting them must filter to that SE only.
 */
export function resolveEffectiveSalesEngineerFilter({
    salesEngineer,
}) {
    return salesEngineer;
}
