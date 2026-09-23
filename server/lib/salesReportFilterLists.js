'use strict';

const { sql } = require('../dbConfig');

function parseReportFilterList(input) {
    if (input === undefined || input === null) return null;
    if (Array.isArray(input)) {
        const items = input.map((x) => String(x || '').trim()).filter(Boolean);
        if (!items.length) return null;
        if (items.some((x) => x.toLowerCase() === 'all')) return null;
        return [...new Set(items)];
    }
    const s = String(input).trim();
    if (!s || s.toLowerCase() === 'all') return null;
    const items = s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    if (!items.length || items.some((x) => x.toLowerCase() === 'all')) return null;
    return [...new Set(items)];
}

function hasReportFilterList(list) {
    return Array.isArray(list) && list.length > 0;
}

function bindInputIfMissing(request, name, type, value) {
    if (!request || !name) return;
    if (request.parameters && Object.prototype.hasOwnProperty.call(request.parameters, name)) return;
    request.input(name, type, value);
}

function bindReportFilterList(request, prefix, values) {
    if (!hasReportFilterList(values)) return 0;
    values.forEach((v, i) => {
        bindInputIfMissing(request, `${prefix}${i}`, sql.NVarChar, v);
    });
    return values.length;
}

function sqlOrTrimMatch(fieldExpr, prefix, count) {
    if (!count) return '';
    const parts = [];
    for (let i = 0; i < count; i++) {
        parts.push(`LTRIM(RTRIM(${fieldExpr})) = LTRIM(RTRIM(@${prefix}${i}))`);
    }
    return `(${parts.join(' OR ')})`;
}

function sqlOrUpperTrimMatch(fieldExpr, prefix, count) {
    if (!count) return '';
    const parts = [];
    for (let i = 0; i < count; i++) {
        parts.push(
            `UPPER(LTRIM(RTRIM(${fieldExpr}))) = UPPER(LTRIM(RTRIM(@${prefix}${i})))`
        );
    }
    return `(${parts.join(' OR ')})`;
}

function sqlMatchAllowedDivisions(deptExpr, allowList) {
    if (!allowList || !allowList.length) return '';
    const parts = allowList.map(
        (_, i) =>
            `UPPER(LTRIM(RTRIM(${deptExpr}))) = UPPER(LTRIM(RTRIM(ISNULL(@srCcDiv${i}, N''))))`
    );
    return ` AND (${parts.join(' OR ')}) `;
}

function bindSalesReportAllowedDivisions(request, allowList) {
    if (!allowList || !allowList.length) return;
    allowList.forEach((name, i) => {
        bindInputIfMissing(request, `srCcDiv${i}`, sql.NVarChar, name);
    });
}

function resolveSalesReportFilterLists(req) {
    return {
        companies: parseReportFilterList(req.query.company),
        divisions: parseReportFilterList(req.query.division),
        roles: parseReportFilterList(req.query.role),
    };
}

function appendSalesReportListParams(params, key, values) {
    if (!hasReportFilterList(values)) return;
    values.forEach((v) => params.append(key, v));
}

function buildConcernedSeNameExistsClause(request, seNames, paramPrefix = 'srSe') {
    if (!hasReportFilterList(seNames)) return '';
    const count = bindReportFilterList(request, paramPrefix, seNames);
    return ` AND EXISTS (
        SELECT 1
        FROM ConcernedSE cse
        WHERE cse.RequestNo = E.RequestNo
          AND ${sqlOrTrimMatch('ISNULL(cse.SEName, N\'\')', paramPrefix, count)}
    ) `;
}

function buildSalesTargetsSeClause(seNames, paramPrefix = 'srSe') {
    if (!hasReportFilterList(seNames)) return '';
    const parts = seNames.map((_, i) => `SalesEngineer = @${paramPrefix}${i}`);
    return ` AND (${parts.join(' OR ')}) `;
}

function buildSalesTargetsDivisionClause(divisions, paramPrefix = 'srDept') {
    if (!hasReportFilterList(divisions)) return '';
    const parts = divisions.map((_, i) => `Division = @${paramPrefix}${i}`);
    return ` AND (${parts.join(' OR ')}) `;
}

function buildMefCompanyExistsClause(companies, paramPrefix = 'srCo') {
    if (!hasReportFilterList(companies)) return '';
    const parts = companies.map(
        (_, i) => `LTRIM(RTRIM(ISNULL(mefT.CompanyName, ''))) = LTRIM(RTRIM(ISNULL(@${paramPrefix}${i}, '')))`
    );
    return ` AND (${parts.join(' OR ')}) `;
}

module.exports = {
    parseReportFilterList,
    hasReportFilterList,
    bindReportFilterList,
    sqlOrTrimMatch,
    sqlOrUpperTrimMatch,
    sqlMatchAllowedDivisions,
    bindSalesReportAllowedDivisions,
    resolveSalesReportFilterLists,
    appendSalesReportListParams,
    buildConcernedSeNameExistsClause,
    buildSalesTargetsSeClause,
    buildSalesTargetsDivisionClause,
    buildMefCompanyExistsClause,
};
