/**
 * Master_ConcernedSE.Department may list multiple divisions (comma-separated),
 * including cross-company DepartmentName values from Master_EnquiryFor.
 */

export function parseUserDepartments(raw) {
    if (Array.isArray(raw)) {
        return [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))];
    }
    return [
        ...new Set(
            String(raw || '')
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)
        ),
    ];
}

export function formatUserDepartments(listOrCsv) {
    return parseUserDepartments(listOrCsv).join(', ');
}

function normDept(s) {
    return String(s || '')
        .replace(/\u00a0/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

/** True if profile Department CSV contains the given division label (case/space insensitive). */
export function userHasDepartment(departmentCsv, divisionLabel) {
    const target = normDept(divisionLabel);
    if (!target) return false;
    return parseUserDepartments(departmentCsv).some((d) => normDept(d) === target);
}

/** True if any token is Management. */
export function userHasManagementDepartment(departmentCsv) {
    return userHasDepartment(departmentCsv, 'management');
}

/**
 * True if any of the user's departments matches any of the candidate labels
 * (or passes optional normalizeKey on both sides).
 */
export function userDepartmentMatchesAny(departmentCsv, labels, normalizeKey = normDept) {
    const userKeys = parseUserDepartments(departmentCsv).map(normalizeKey).filter(Boolean);
    if (!userKeys.length) return false;
    const labelKeys = (Array.isArray(labels) ? labels : [labels])
        .map((l) => normalizeKey(l))
        .filter(Boolean);
    if (!labelKeys.length) return false;
    return userKeys.some((uk) => labelKeys.some((lk) => uk === lk));
}

/**
 * True if any Department token is contained in / contains `text` (job name, TO name, etc.).
 */
export function anyDepartmentTokenMatchesText(departmentCsv, text) {
    const t = normDept(text);
    if (!t) return false;
    return parseUserDepartments(departmentCsv).some((d) => {
        const dk = normDept(d);
        if (!dk) return false;
        return t.includes(dk) || dk.includes(t);
    });
}

/** Elevated / non–sub-user departments (Probability / Quote lead access heuristics). */
export function userHasElevatedDepartment(departmentCsv) {
    return parseUserDepartments(departmentCsv).some((d) => {
        const n = normDept(d);
        return n === 'civil' || n === 'admin' || n === 'management' || n === 'bms admin';
    });
}
