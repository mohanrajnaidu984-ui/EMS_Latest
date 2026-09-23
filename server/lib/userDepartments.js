'use strict';

/**
 * Master_ConcernedSE.Department may list multiple divisions (comma-separated),
 * including cross-company DepartmentName values from Master_EnquiryFor.
 */

function parseUserDepartments(raw) {
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

function formatUserDepartments(listOrCsv) {
    return parseUserDepartments(listOrCsv).join(', ');
}

function normDept(s) {
    return String(s || '')
        .replace(/\u00a0/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function userHasDepartment(departmentCsv, divisionLabel) {
    const target = normDept(divisionLabel);
    if (!target) return false;
    return parseUserDepartments(departmentCsv).some((d) => normDept(d) === target);
}

function userHasManagementDepartment(departmentCsv) {
    return userHasDepartment(departmentCsv, 'management');
}

function userDepartmentMatchesAny(departmentCsv, labels, normalizeKey = normDept) {
    const userKeys = parseUserDepartments(departmentCsv).map(normalizeKey).filter(Boolean);
    if (!userKeys.length) return false;
    const labelKeys = (Array.isArray(labels) ? labels : [labels])
        .map((l) => normalizeKey(l))
        .filter(Boolean);
    if (!labelKeys.length) return false;
    return userKeys.some((uk) => labelKeys.some((lk) => uk === lk));
}

/**
 * Expand one SQL DivisionLabel that may itself be a CSV into distinct labels.
 * @param {string[]} labels
 */
function expandDivisionLabels(labels) {
    const out = [];
    const seen = new Set();
    for (const raw of labels || []) {
        for (const part of parseUserDepartments(raw)) {
            const key = normDept(part);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(part);
        }
    }
    return out;
}

/**
 * SQL predicate: Master_ConcernedSE.Department (CSV) contains a single division label.
 * @param {string} columnExpr e.g. `m.Department` or `msD.Department`
 * @param {string} paramName e.g. `divisionFilter` or `@division` (with or without @)
 */
function sqlMasterDepartmentContains(columnExpr, paramName) {
    const p = String(paramName || '').startsWith('@') ? String(paramName) : `@${paramName}`;
    const col = String(columnExpr || 'Department');
    return `(
        LTRIM(RTRIM(ISNULL(${col}, N''))) = LTRIM(RTRIM(${p}))
        OR N',' + REPLACE(LTRIM(RTRIM(ISNULL(${col}, N''))), N' ', N'') + N','
           LIKE N'%,' + REPLACE(LTRIM(RTRIM(${p})), N' ', N'') + N',%'
    )`;
}

/** SQL predicate: Department CSV contains the token "management" (case-insensitive). */
function sqlMasterDepartmentIsManagement(columnExpr) {
    const col = String(columnExpr || 'Department');
    return `(
        LOWER(LTRIM(RTRIM(ISNULL(${col}, N'')))) = N'management'
        OR N',' + REPLACE(LOWER(LTRIM(RTRIM(ISNULL(${col}, N'')))), N' ', N'') + N','
           LIKE N'%,management,%'
    )`;
}

/**
 * True if any Department token matches a job/item name (includes / strip "project").
 */
function anyDepartmentTokenMatchesJobName(departmentCsv, jobName) {
    const jobNameRaw = String(jobName || '')
        .replace(/^(L\d+|Sub Job)\s*-\s*/i, '')
        .trim();
    const jobNameNorm = jobNameRaw.toLowerCase();
    if (!jobNameNorm) return false;
    const jobCore = jobNameNorm.replace(/\s+project\s*$/i, '').trim();
    return parseUserDepartments(departmentCsv).some((tok) => {
        const deptNorm = String(tok || '')
            .toLowerCase()
            .trim()
            .replace(/\s+project\s*$/i, '')
            .trim();
        if (!deptNorm) return false;
        return jobNameNorm.includes(deptNorm) || jobCore.includes(deptNorm) || deptNorm.includes(jobCore);
    });
}

/**
 * SQL OR of LIKE predicates for each Department CSV token vs MEF/EF ItemName.
 * @param {string} departmentCsv
 * @param {string} mefItemExpr e.g. `MEF.ItemName`
 * @param {string} efItemExpr e.g. `EF.ItemName`
 * @param {(s: string) => string} [normalizeFn] optional name normalizer (e.g. strip L-prefix)
 */
function buildMultiDeptItemNameLikeSql(departmentCsv, mefItemExpr, efItemExpr, normalizeFn) {
    const tokens = parseUserDepartments(departmentCsv);
    if (!tokens.length) return '1=0';
    return tokens
        .map((t) => {
            const esc = String(t).replace(/'/g, "''");
            const norm = normalizeFn ? String(normalizeFn(t) || '').replace(/'/g, "''") : '';
            return `(
                    LOWER(LTRIM(RTRIM(${mefItemExpr}))) LIKE '%' + LOWER(LTRIM(RTRIM('${esc}'))) + '%'
                    OR LOWER(LTRIM(RTRIM(${efItemExpr}))) LIKE '%' + LOWER(LTRIM(RTRIM('${esc}'))) + '%'
                    OR (${
                        norm
                            ? `LOWER(LTRIM(RTRIM(${mefItemExpr}))) LIKE '%' + N'${norm}' + '%'
                    OR LOWER(LTRIM(RTRIM(${efItemExpr}))) LIKE '%' + N'${norm}' + '%'`
                            : '1=0'
                    })
                )`;
        })
        .join('\n                    OR ');
}

module.exports = {
    parseUserDepartments,
    formatUserDepartments,
    userHasDepartment,
    userHasManagementDepartment,
    userDepartmentMatchesAny,
    expandDivisionLabels,
    sqlMasterDepartmentContains,
    sqlMasterDepartmentIsManagement,
    anyDepartmentTokenMatchesJobName,
    buildMultiDeptItemNameLikeSql,
    normDept,
};
