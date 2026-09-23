
const express = require('express');
const router = express.Router();
const { sql } = require('../dbConfig');
const {
    resolvePricingAccessContext,
    normalizePricingEmail,
    userHasUnlockedReportFilters,
    userIsCcMailReportScoped,
} = require('../lib/quotePricingAccess');
const {
    parseUserDepartments,
    sqlMasterDepartmentContains,
} = require('../lib/userDepartments');
const {
    parseReportFilterList,
    hasReportFilterList,
    bindReportFilterList,
    sqlOrTrimMatch,
    sqlOrUpperTrimMatch,
    sqlMatchAllowedDivisions,
    bindSalesReportAllowedDivisions,
    resolveSalesReportFilterLists,
    buildConcernedSeNameExistsClause,
    buildSalesTargetsSeClause,
    buildSalesTargetsDivisionClause,
    buildMefCompanyExistsClause,
} = require('../lib/salesReportFilterLists');

const sanitizeInput = (input) => {
    if (input === undefined || input === null || input === 'null' || input === 'undefined') return null;
    const s = String(input).trim();
    return s === '' ? null : s;
};

const normalizeReportFilterValue = (input) => {
    const s = sanitizeInput(input);
    if (!s) return null;
    return s.toLowerCase() === 'all' ? null : s;
};

function bindInputIfMissing(request, name, type, value) {
    if (!request || !name) return;
    if (request.parameters && Object.prototype.hasOwnProperty.call(request.parameters, name)) return;
    request.input(name, type, value);
}

function cloneMssqlRequest(sourceRequest) {
    const r = new sql.Request();
    const params = (sourceRequest && sourceRequest.parameters) || {};
    for (const name of Object.keys(params)) {
        const p = params[name];
        if (!p || p.value === undefined) continue;
        try {
            r.input(name, p.type, p.value);
        } catch (_) {
            /* skip duplicates / unsupported */
        }
    }
    return r;
}

async function resolveSalesReportAccess(emailRaw) {
    const email = normalizePricingEmail(emailRaw);
    if (!email) return null;
    return resolvePricingAccessContext(email);
}

async function fetchCcMailScopedPairs(email) {
    const ccReq = new sql.Request();
    ccReq.input('email', sql.NVarChar, email);
    const ccRows = await ccReq.query(`
        SELECT CompanyName, DepartmentName
        FROM Master_EnquiryFor
        WHERE ',' + REPLACE(REPLACE(ISNULL(CCMailIds, ''), ' ', ''), ';', ',') + ','
              LIKE '%,' + REPLACE(REPLACE(@email, ' ', ''), ';', ',') + ',%'
    `);
    return (ccRows.recordset || [])
        .map((r) => ({
            company: String(r.CompanyName || '').trim(),
            division: String(r.DepartmentName || '').trim(),
        }))
        .filter((r) => r.company || r.division);
}

/** CC-mail users may only query company/division pairs from their CCMailIds rows (SE filter stays optional). */
function clampSalesReportQueryToCcPairs(req, pairs) {
    if (!pairs || pairs.length === 0) return;
    const allowedCompanies = [...new Set(pairs.map((p) => p.company).filter(Boolean))];
    let qCompanies = parseReportFilterList(req.query.company);
    if (qCompanies && qCompanies.length) {
        qCompanies = qCompanies.filter((c) => allowedCompanies.includes(c));
    }
    if (!qCompanies || !qCompanies.length) {
        qCompanies = allowedCompanies;
    }
    req.query.company = qCompanies.length === 1 ? qCompanies[0] : qCompanies;

    const divisionSource = qCompanies.length
        ? pairs.filter((p) => qCompanies.includes(p.company))
        : pairs;
    const allowedDivisions = [...new Set(divisionSource.map((p) => p.division).filter(Boolean))];
    req.salesReportAllowedDivisions = allowedDivisions;

    let qDivisions = parseReportFilterList(req.query.division);
    if (qDivisions && qDivisions.length) {
        qDivisions = qDivisions.filter((d) => allowedDivisions.includes(d));
    }
    if (!qDivisions || !qDivisions.length) {
        req.query.division = 'All';
    } else {
        req.query.division = qDivisions.length === 1 ? qDivisions[0] : qDivisions;
    }
}

const SQL_EF_MEF_ITEM_JOIN =
    `(ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName)`;

/**
 * When Division=All for a CC-scoped user, restrict to their CCMailIds departments for the company.
 * Returns null for Admin/Management (all company divisions), or a non-empty string[] of allowed names.
 */
function resolveSalesReportDivisionAllowList(req, divisions) {
    if (hasReportFilterList(divisions)) return null;
    if (req.salesReportCcScope !== true) return null;
    const list = Array.isArray(req.salesReportAllowedDivisions)
        ? req.salesReportAllowedDivisions.map((d) => String(d || '').trim()).filter(Boolean)
        : [];
    return list.length ? list : null;
}

/**
 * Hard company (+ optional division) scope on the same EnquiryFor / Master_EnquiryFor row.
 * Division=All + CC allow-list → only those departments. Division=All + unlocked → all company depts.
 */
function sqlEnquiryForCompanyDivisionExists(request, companies, divisions, allowList = null) {
    const companyCount = hasReportFilterList(companies)
        ? bindReportFilterList(request, 'srCo', companies)
        : 0;
    const divisionCount = hasReportFilterList(divisions)
        ? bindReportFilterList(request, 'srDept', divisions)
        : 0;

    if (!companyCount && !divisionCount && !(allowList && allowList.length)) {
        return '';
    }

    let inner = '';
    if (companyCount) {
        inner += ` AND ${sqlOrTrimMatch('mef.CompanyName', 'srCo', companyCount)} `;
    }
    if (divisionCount) {
        inner += ` AND ${sqlOrTrimMatch('mef.DepartmentName', 'srDept', divisionCount)} `;
    } else if (allowList && allowList.length) {
        inner += sqlMatchAllowedDivisions('mef.DepartmentName', allowList);
    }

    return ` AND EXISTS (
                    SELECT 1
                    FROM EnquiryFor ef
                    JOIN Master_EnquiryFor mef ON ${SQL_EF_MEF_ITEM_JOIN}
                    WHERE ef.RequestNo = E.RequestNo
                      ${inner}
                ) `;
}

function bindSalesReportCompanyDivision(request, companies, divisions, allowList = null) {
    if (hasReportFilterList(companies)) {
        bindReportFilterList(request, 'srCo', companies);
    }
    if (hasReportFilterList(divisions)) {
        bindReportFilterList(request, 'srDept', divisions);
    }
    bindSalesReportAllowedDivisions(request, allowList);
}

/** Non–CC-mail users: force filters to their company / division / SE so APIs cannot be scoped wider via query string. */
async function applySalesReportEmailScope(req) {
    delete req.salesReportForceSeName;
    delete req.salesReportNonCcBlock;
    delete req.salesReportNonCcScope;
    delete req.salesReportCcScope;
    delete req.salesReportUserEmail;
    delete req.salesReportAllowedDivisions;

    const raw = req.query && req.query.email;
    if (!raw || String(raw).trim() === '') return;
    const email = String(raw)
        .toLowerCase()
        .replace(/@almcg\.com/g, '@almoayyedcg.com')
        .trim();

    const accessCtx = await resolveSalesReportAccess(email);
    if (userHasUnlockedReportFilters(accessCtx)) return;

    const ccPairs = await fetchCcMailScopedPairs(email);
    if (ccPairs.length > 0) {
        req.salesReportCcScope = true;
        clampSalesReportQueryToCcPairs(req, ccPairs);
        return;
    }

    const rq = new sql.Request();
    rq.input('email', sql.NVarChar, email);
    const userRes = await rq.query(`
        SELECT TOP 1 FullName, Department
        FROM Master_ConcernedSE
        WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = LOWER(LTRIM(RTRIM(@email)))
    `);
    const user = userRes.recordset?.[0];
    if (!user) {
        req.salesReportNonCcBlock = true;
        return;
    }

    req.salesReportNonCcScope = true;
    req.salesReportUserEmail = email;

    const deptTokens = parseUserDepartments(user.Department || '');
    let company = '';
    if (deptTokens.length) {
        for (const dept of deptTokens) {
            const cReq = new sql.Request();
            cReq.input('dept', sql.NVarChar, dept);
            const cRes = await cReq.query(`
                SELECT TOP 1 CompanyName FROM Master_EnquiryFor WHERE DepartmentName = @dept
            `);
            company = String(cRes.recordset?.[0]?.CompanyName || '').trim();
            if (company) break;
        }
    }
    if (company) req.query.company = company;
    // Clamp division to assigned departments (multi-select). Empty/All → all assigned.
    const deptNorm = (s) => String(s || '').trim().toLowerCase();
    let qDivisions = parseReportFilterList(req.query.division);
    if (qDivisions && qDivisions.length) {
        qDivisions = [
            ...new Set(
                qDivisions
                    .map((d) => deptTokens.find((t) => deptNorm(t) === deptNorm(d)) || '')
                    .filter(Boolean)
            ),
        ];
    }
    if (!qDivisions || !qDivisions.length) {
        if (deptTokens.length === 1) req.query.division = deptTokens[0];
        else if (deptTokens.length > 1) req.query.division = deptTokens;
        else delete req.query.division;
    } else {
        req.query.division = qDivisions.length === 1 ? qDivisions[0] : qDivisions;
    }
    const fn = String(user.FullName || '').trim();
    if (!fn) {
        req.salesReportNonCcBlock = true;
        return;
    }
    req.query.role = fn;
    req.salesReportForceSeName = fn;
}

/** Latest Probability row per enquiry (by UpdatedDateTime). */
const SQL_LATEST_PROB_CTE = `
WITH LatestProb AS (
    SELECT * FROM (
        SELECT P.*,
            ROW_NUMBER() OVER (PARTITION BY P.RequestNo ORDER BY P.UpdatedDateTime DESC) AS __rn
        FROM dbo.Probability P
    ) __lp WHERE __lp.__rn = 1
)
`;

/** Numeric % from ProbabilityChance label — prefers parenthetical e.g. "(75%)" in "Medium Chance (75%)". */
const SQL_PROB_CHANCE_PCT_EXPR = `
CASE
    WHEN P.ProbabilityChance LIKE '%([0-9]%' AND CHARINDEX('%)', P.ProbabilityChance) > PATINDEX('%([0-9]%', P.ProbabilityChance)
    THEN TRY_CONVERT(
        INT,
        SUBSTRING(
            P.ProbabilityChance,
            PATINDEX('%([0-9]%', P.ProbabilityChance) + 1,
            CHARINDEX('%)', P.ProbabilityChance) - PATINDEX('%([0-9]%', P.ProbabilityChance) - 1
        )
    )
    WHEN PATINDEX('%[0-9]%', P.ProbabilityChance) > 0
    THEN TRY_CONVERT(
        INT,
        LEFT(
            LTRIM(P.ProbabilityChance),
            PATINDEX('%[^0-9]%', LTRIM(P.ProbabilityChance) + 'x') - 1
        )
    )
    ELSE NULL
END`;

/** L-code (L1, L2, …) parsed from a Probability lead-job label e.g. "L1 - Civil Project". */
function sqlLeadJobCodeFromNameExpr(col = 'P.LeadJobName') {
    return `
UPPER(LTRIM(RTRIM(
  CASE
    WHEN PATINDEX('L[0-9]%', LTRIM(RTRIM(ISNULL(${col}, N'')))) = 1
    THEN LEFT(
      LTRIM(RTRIM(${col})),
      CASE
        WHEN CHARINDEX(' ', LTRIM(RTRIM(${col})) + N' ') > 1
          THEN CHARINDEX(' ', LTRIM(RTRIM(${col})) + N' ') - 1
        WHEN CHARINDEX(N'-', LTRIM(RTRIM(${col})) + N'-') > 1
          THEN CHARINDEX(N'-', LTRIM(RTRIM(${col})) + N'-') - 1
        ELSE LEN(LTRIM(RTRIM(${col})))
      END
    )
    ELSE NULL
  END
)))`;
}

function sqlCseAccountabilityYes(alias = 'cse') {
    return `UPPER(LTRIM(RTRIM(ISNULL(${alias}.accountability, ISNULL(${alias}.Accountability, N''))))) = N'YES'`;
}

function sqlCseLeadJobCode(alias = 'cse') {
    return `UPPER(LTRIM(RTRIM(ISNULL(${alias}.leadjobcode, ISNULL(${alias}.LeadJobCode, N'')))))`;
}

function sqlCseOwnJob(alias = 'cse') {
    return `UPPER(LTRIM(RTRIM(ISNULL(${alias}.ownjob, ISNULL(${alias}.OwnJob, N'')))))`;
}

function sqlCseOwnJobDivisionMatch(cseAlias, divisionParam = '@division') {
    const cseOwn = sqlCseOwnJob(cseAlias);
    const divNorm = `UPPER(LTRIM(RTRIM(ISNULL(${divisionParam}, N''))))`;
    return `(
        ${cseOwn} = ${divNorm}
        OR (
            ${cseOwn} = N''
            AND EXISTS (
                SELECT 1
                FROM Master_ConcernedSE msD
                WHERE UPPER(LTRIM(RTRIM(ISNULL(msD.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(${cseAlias}.SEName, N''))))
                  AND (
                    UPPER(LTRIM(RTRIM(ISNULL(msD.Department, N'')))) = ${divNorm}
                    OR N',' + REPLACE(UPPER(LTRIM(RTRIM(ISNULL(msD.Department, N'')))), N' ', N'') + N','
                       LIKE N'%,' + REPLACE(${divNorm}, N' ', N'') + N',%'
                  )
            )
        )
    )`;
}

function sqlEfLeadJobCode(alias = 'ef') {
    return `UPPER(LTRIM(RTRIM(ISNULL(${alias}.LeadJobCode, ISNULL(${alias}.leadjobcode, N'')))))`;
}

/**
 * L-code for a Probability row: parse "L1 - …" from LeadJobName when present, else map via EnquiryFor
 * (LeadJobName / ItemName on the enquiry structure).
 */
function sqlProbLeadJobCodeExpr() {
    const fromLeadJobName = sqlLeadJobCodeFromNameExpr('P.LeadJobName');
    const leadJobNameNorm = `UPPER(LTRIM(RTRIM(ISNULL(P.LeadJobName, N''))))`;
    const ownJobNameNorm = `UPPER(LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))))`;
    const efLeadJobNameNorm = `UPPER(LTRIM(RTRIM(ISNULL(ef.LeadJobName, N''))))`;
    const efItemNameNorm = `UPPER(LTRIM(RTRIM(ISNULL(ef.ItemName, N''))))`;
    return `
COALESCE(
    ${fromLeadJobName},
    (
        SELECT TOP 1 ${sqlEfLeadJobCode('ef')}
        FROM EnquiryFor ef
        WHERE ef.RequestNo = E.RequestNo
          AND ${sqlEfLeadJobCode('ef')} LIKE N'L[0-9]%'
          AND (
            ${efLeadJobNameNorm} = ${leadJobNameNorm}
            OR ${efItemNameNorm} = ${leadJobNameNorm}
            OR (
                ${leadJobNameNorm} = N''
                AND ${ownJobNameNorm} <> N''
                AND ${efItemNameNorm} = ${ownJobNameNorm}
            )
          )
        ORDER BY
            CASE WHEN ${efLeadJobNameNorm} = ${leadJobNameNorm} THEN 0 ELSE 1 END,
            CASE WHEN ef.ParentID IS NULL THEN 0 ELSE 1 END,
            ef.ID
    )
)`;
}

/**
 * When Probability row P is in scope: achievement counts only if selected SE is the
 * accountable assignee for that enquiry + job line (ConcernedSE.ownjob + leadjobcode).
 */
function buildSalesReportProbAccountableSeClauseForName(seParamName) {
    const leadJobCodeExpr = sqlProbLeadJobCodeExpr();
    const probOwnJobNorm = `UPPER(LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))))`;
    const cseOwnJobNorm = sqlCseOwnJob('c0');

    return `
      EXISTS (
        SELECT 1
        FROM ConcernedSE c0
        WHERE c0.RequestNo = E.RequestNo
          AND ${sqlCseAccountabilityYes('c0')}
          AND UPPER(LTRIM(RTRIM(ISNULL(c0.SEName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@${seParamName}, N''))))
          AND (
            (
              ${probOwnJobNorm} <> N''
              AND ${cseOwnJobNorm} = ${probOwnJobNorm}
            )
            OR (
              ${probOwnJobNorm} <> N''
              AND ${cseOwnJobNorm} = N''
              AND EXISTS (
                SELECT 1
                FROM Master_ConcernedSE ms0
                WHERE UPPER(LTRIM(RTRIM(ISNULL(ms0.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c0.SEName, N''))))
                  AND (
                    UPPER(LTRIM(RTRIM(ISNULL(ms0.Department, N'')))) = ${probOwnJobNorm}
                    OR N',' + REPLACE(UPPER(LTRIM(RTRIM(ISNULL(ms0.Department, N'')))), N' ', N'') + N','
                       LIKE N'%,' + REPLACE(${probOwnJobNorm}, N' ', N'') + N',%'
                  )
              )
            )
            OR (
              ${probOwnJobNorm} = N''
              AND ${sqlCseLeadJobCode('c0')} = ${leadJobCodeExpr}
              AND ${sqlCseLeadJobCode('c0')} <> N''
            )
            OR (
              ${probOwnJobNorm} <> N''
              AND ${cseOwnJobNorm} = N''
              AND ${sqlCseLeadJobCode('c0')} = ${leadJobCodeExpr}
              AND ${sqlCseLeadJobCode('c0')} <> N''
            )
            OR (
              ${probOwnJobNorm} = N''
              AND UPPER(LTRIM(RTRIM(ISNULL(P.QuoteOwnJob, N'')))) <> N''
              AND ${cseOwnJobNorm} = UPPER(LTRIM(RTRIM(ISNULL(P.QuoteOwnJob, N''))))
            )
          )
      )`;
}

function buildSalesReportProbAccountableSeClause(request, effectiveSeList, seInputPrefix = 'srSeAcct') {
    if (!hasReportFilterList(effectiveSeList)) return '';
    const parts = effectiveSeList.map((name, i) => {
        bindInputIfMissing(request, `${seInputPrefix}${i}`, sql.NVarChar, name);
        return buildSalesReportProbAccountableSeClauseForName(`${seInputPrefix}${i}`);
    });
    return ` AND (${parts.join(' OR ')}) `;
}

function buildSalesReportEnquiryScopeClause({
    request,
    nonCcBlock,
    companies,
    divisions,
    effectiveSeList,
    accountableSeOnly = false,
    allowList = null,
}) {
    let clause = '';
    if (nonCcBlock) {
        clause += ' AND 1=0 ';
    } else {
        clause += sqlEnquiryForCompanyDivisionExists(request, companies, divisions, allowList);
        if (hasReportFilterList(effectiveSeList)) {
            if (accountableSeOnly) {
                clause += buildSalesReportProbAccountableSeClause(request, effectiveSeList);
            } else {
                clause += buildConcernedSeNameExistsClause(request, effectiveSeList);
            }
        }
    }
    return clause;
}

/**
 * Quote OwnJob must belong to the selected company (and division / CC allow-list when set).
 */
function buildSalesReportQuoteOwnJobDivisionClause(
    request,
    divisions,
    eqAlias = 'EQ',
    companies = null,
    allowList = null
) {
    const companyCount = hasReportFilterList(companies)
        ? bindReportFilterList(request, 'srCo', companies)
        : 0;
    if (!companyCount && !(allowList && allowList.length)) {
        return '';
    }
    const ownExpr = `UPPER(LTRIM(RTRIM(ISNULL(${eqAlias}.OwnJob, N''))))`;
    let divFilter = '';
    if (hasReportFilterList(divisions)) {
        const divCount = bindReportFilterList(request, 'srDept', divisions);
        divFilter = ` AND ${sqlOrUpperTrimMatch('mefOJ.DepartmentName', 'srDept', divCount)} `;
    } else if (allowList && allowList.length) {
        divFilter = sqlMatchAllowedDivisions('mefOJ.DepartmentName', allowList);
    }
    const companyMatch = companyCount
        ? ` AND ${sqlOrTrimMatch('mefOJ.CompanyName', 'srCo', companyCount)} `
        : '';
    return ` AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefOJ
                    WHERE LTRIM(RTRIM(ISNULL(mefOJ.DepartmentName, N''))) <> N''
                      ${companyMatch}
                      ${divFilter}
                      AND ${ownExpr} = UPPER(LTRIM(RTRIM(mefOJ.DepartmentName)))
                )`;
}

/**
 * Quoted KPI total — same LatestQuoted grain + max-per-enquiry as Jobs (Quoted) table.
 * @param {string} [quoteSeAccountableClause] — optional OwnJob-accountable SE filter on EQ.
 */
function buildQuotedMaxPerEnquiryKpiSql(
    request,
    filterClause,
    divisions,
    safeQuarter,
    companies = null,
    allowList = null,
    quoteSeAccountableClause = ''
) {
    const quotedEqOwnJobExpr = `LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))`;
    const quotedOwnJobDivisionClause = buildSalesReportQuoteOwnJobDivisionClause(
        request,
        divisions,
        'EQ',
        companies,
        allowList
    );
    const yearDateExpr = `COALESCE(LQ.QuoteDate, E.EnquiryDate)`;
    const quarterClause = safeQuarter
        ? `AND DATEPART(QUARTER, ${yearDateExpr}) = @quarterNums`
        : '';
    return `
            WITH LatestQuoted AS (
                SELECT * FROM (
                    SELECT
                        EQ.RequestNo,
                        ISNULL(
                            TRY_CONVERT(
                                DECIMAL(18,2),
                                REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EQ.TotalAmount, '0'))), ',', ''), 'BD', ''), ' ', '')
                            ),
                            0
                        ) AS NetQuotedValue,
                        COALESCE(EQ.UpdatedAt, EQ.QuoteDate) AS QuoteDate,
                        ROW_NUMBER() OVER (
                            PARTITION BY
                                EQ.RequestNo,
                                ${quotedEqOwnJobExpr},
                                LTRIM(RTRIM(ISNULL(EQ.ToName, N'')))
                            ORDER BY
                                ISNULL(EQ.QuoteNo, 0) DESC,
                                ISNULL(EQ.RevisionNo, 0) DESC,
                                ISNULL(EQ.UpdatedAt, EQ.QuoteDate) DESC,
                                EQ.QuoteDate DESC
                        ) AS __rn
                    FROM EnquiryQuotes EQ
                    INNER JOIN EnquiryMaster E ON E.RequestNo = EQ.RequestNo
                    WHERE 1 = 1
                      ${quotedOwnJobDivisionClause}
                      ${quoteSeAccountableClause || ''}
                      ${filterClause}
                ) __lq
                WHERE __lq.__rn = 1
            ),
            MaxPerEnquiry AS (
                SELECT
                    E.RequestNo,
                    MAX(LQ.NetQuotedValue) AS MaxValue
                FROM EnquiryMaster E
                INNER JOIN LatestQuoted LQ ON E.RequestNo = LQ.RequestNo
                WHERE YEAR(${yearDateExpr}) = @year
                  ${filterClause}
                  ${quarterClause}
                GROUP BY E.RequestNo
            )
            SELECT
                COUNT(*) AS Cnt,
                SUM(ISNULL(MaxValue, 0)) AS TotalValue
            FROM MaxPerEnquiry
        `;
}

/**
 * Accountable SE for quote rows (no Probability alias) — matches ConcernedSE to EnquiryQuotes.OwnJob.
 */
function buildSalesReportQuoteAccountableSeClauseForName(seParamName, eqAlias = 'EQ') {
    const eqOwnJobNorm = `UPPER(LTRIM(RTRIM(ISNULL(${eqAlias}.OwnJob, N''))))`;
    const cseOwnJobNorm = sqlCseOwnJob('c0');
    return `
      EXISTS (
        SELECT 1
        FROM ConcernedSE c0
        WHERE c0.RequestNo = E.RequestNo
          AND ${sqlCseAccountabilityYes('c0')}
          AND UPPER(LTRIM(RTRIM(ISNULL(c0.SEName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@${seParamName}, N''))))
          AND (
            (
              ${eqOwnJobNorm} <> N''
              AND ${cseOwnJobNorm} = ${eqOwnJobNorm}
            )
            OR (
              ${eqOwnJobNorm} <> N''
              AND ${cseOwnJobNorm} = N''
              AND EXISTS (
                SELECT 1
                FROM Master_ConcernedSE ms0
                WHERE UPPER(LTRIM(RTRIM(ISNULL(ms0.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c0.SEName, N''))))
                  AND UPPER(LTRIM(RTRIM(ISNULL(ms0.Department, N'')))) = ${eqOwnJobNorm}
              )
            )
          )
      )`;
}

function buildSalesReportQuoteAccountableSeClause(request, effectiveSeList, seInputPrefix = 'srSeQ', eqAlias = 'EQ') {
    if (!hasReportFilterList(effectiveSeList)) return '';
    const parts = effectiveSeList.map((name, i) => {
        bindInputIfMissing(request, `${seInputPrefix}${i}`, sql.NVarChar, name);
        return buildSalesReportQuoteAccountableSeClauseForName(`${seInputPrefix}${i}`, eqAlias);
    });
    return ` AND (${parts.join(' OR ')}) `;
}

/** Company + division only (no SE) — for pending outer query when P may be NULL. */
function buildSalesReportPendingEnquiryScopeClause({
    request,
    nonCcBlock,
    companies,
    divisions,
    allowList = null,
}) {
    return buildSalesReportEnquiryScopeClause({
        request,
        nonCcBlock,
        companies,
        divisions,
        effectiveSeList: null,
        accountableSeOnly: false,
        allowList,
    });
}

/**
 * Pending-to-update-probability scope: company + division (EnquiryFor) and accountable SE per job line.
 * Used for Jobs (Pending) table and Sales Pipeline “Pending” (10% quoted) bucket.
 */
function buildSalesReportPendingScopeClause({
    request,
    nonCcBlock,
    companies,
    divisions,
    effectiveSeList,
    allowList = null,
}) {
    return buildSalesReportEnquiryScopeClause({
        request,
        nonCcBlock,
        companies,
        divisions,
        effectiveSeList,
        accountableSeOnly: true,
        allowList,
    });
}

/** Pending scope for quoted rows without a Probability record (uses EnquiryQuotes.OwnJob). */
function buildSalesReportPendingQuoteScopeClause({
    request,
    nonCcBlock,
    companies,
    divisions,
    effectiveSeList,
    allowList = null,
}) {
    let clause = buildSalesReportPendingEnquiryScopeClause({
        request,
        nonCcBlock,
        companies,
        divisions,
        allowList,
    });
    if (nonCcBlock) return clause;
    if (hasReportFilterList(effectiveSeList)) {
        clause += buildSalesReportQuoteAccountableSeClause(request, effectiveSeList, 'srSePend', 'EQ');
    }
    return clause;
}

const SQL_PROB_STATUS_PENDING_QUOTED_NORM = `REPLACE(REPLACE(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))), '-', ''), ' ', '')`;

/** Matches Probability “Pending Update” — quoted / not-yet-updated statuses (not Won/Lost/terminal). */
const SQL_PROB_ROW_PENDING_FOR_QUOTE_UPDATE = `(
    (
        P.RequestNo IS NOT NULL
        AND (
            ${SQL_PROB_STATUS_PENDING_QUOTED_NORM} IN ('pending', 'quote', 'quoted', 'enquiry', 'priced', 'estimated')
            OR LTRIM(RTRIM(ISNULL(P.Status, ''))) = ''
        )
        AND LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) NOT LIKE '%won%'
        AND LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) NOT LIKE '%lost%'
        AND LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) NOT LIKE '%hold%'
        AND LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) NOT LIKE '%cancel%'
        AND LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) NOT LIKE '%retender%'
        AND NOT (
            LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%follow%'
            AND LTRIM(RTRIM(ISNULL(P.ProbabilityChance, ''))) <> ''
        )
    )
    OR (
        P.RequestNo IS NOT NULL
        AND LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%follow%'
        AND LTRIM(RTRIM(ISNULL(P.ProbabilityChance, ''))) = ''
    )
)`;

function buildSalesReportPendingQuotedAggregateSql({
    probDateExpr,
    safeQuarter,
    pendingScopeClause,
    pendingQuoteScopeClause,
    probOwnJobClause,
    quoteOwnJobClause,
}) {
    const quarterClause = safeQuarter
        ? `AND DATEPART(QUARTER, ${probDateExpr}) = @quarterNums`
        : '';
    const quoteYearClause = safeQuarter
        ? `AND DATEPART(QUARTER, COALESCE(EQ.UpdatedAt, EQ.QuoteDate, E.EnquiryDate)) = @quarterNums`
        : '';
    /**
     * Performance: year-gate Probability + Quotes before ROW_NUMBER, JOIN quote amounts
     * (was a correlated MAX subquery over LatestQuotePerOwnJob — ~3s on AAC).
     */
    return `
WITH LatestProbPendingFunnelScope AS (
    SELECT * FROM (
        SELECT P.*,
            ROW_NUMBER() OVER (
                PARTITION BY P.RequestNo, LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))), LTRIM(RTRIM(ISNULL(P.LeadJobName, N'')))
                ORDER BY P.UpdatedDateTime DESC, P.ID DESC
            ) AS __rn
        FROM dbo.Probability P
        INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
        WHERE YEAR(COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime, E.EnquiryDate)) = @year
          ${probOwnJobClause || ''}
          ${pendingScopeClause || ''}
    ) __f WHERE __f.__rn = 1
),
LatestQuotePerOwnJob AS (
    SELECT * FROM (
        SELECT
            EQ.RequestNo,
            LTRIM(RTRIM(ISNULL(EQ.OwnJob, N''))) AS QuoteOwnJob,
            ISNULL(
                TRY_CONVERT(
                    DECIMAL(18,2),
                    REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EQ.TotalAmount, '0'))), ',', ''), 'BD', ''), ' ', '')
                ),
                0
            ) AS QuoteAmount,
            COALESCE(EQ.UpdatedAt, EQ.QuoteDate) AS LatestQuoteDate,
            ROW_NUMBER() OVER (
                PARTITION BY
                    EQ.RequestNo,
                    LTRIM(RTRIM(ISNULL(EQ.OwnJob, N''))),
                    LTRIM(RTRIM(ISNULL(EQ.ToName, N'')))
                ORDER BY
                    ISNULL(EQ.QuoteNo, 0) DESC,
                    ISNULL(EQ.RevisionNo, 0) DESC,
                    ISNULL(EQ.UpdatedAt, EQ.QuoteDate) DESC,
                    EQ.QuoteDate DESC
            ) AS __rn
        FROM EnquiryQuotes EQ
        INNER JOIN EnquiryMaster E ON E.RequestNo = EQ.RequestNo
        WHERE YEAR(COALESCE(EQ.UpdatedAt, EQ.QuoteDate, E.EnquiryDate)) = @year
          ${quoteYearClause}
          ${quoteOwnJobClause}
          ${pendingQuoteScopeClause}
    ) z
    WHERE z.__rn = 1
),
PendingLines AS (
    SELECT
        P.RequestNo,
        COALESCE(
            ${SQL_PROB_NETQUOTED_PARSED},
            LQ.QuoteAmount,
            CAST(0 AS DECIMAL(18,2))
        ) AS ScopedValue
    FROM LatestProbPendingFunnelScope P
    INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
    LEFT JOIN LatestQuotePerOwnJob LQ
        ON LQ.RequestNo = P.RequestNo
       AND (
            UPPER(LTRIM(RTRIM(ISNULL(P.OwnJobName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(LQ.QuoteOwnJob, N''))))
            OR (
                LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))) = N''
                AND UPPER(LTRIM(RTRIM(ISNULL(P.QuoteOwnJob, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(LQ.QuoteOwnJob, N''))))
            )
       )
    WHERE YEAR(${probDateExpr}) = @year
      ${quarterClause}
      AND ${SQL_PROB_ROW_PENDING_FOR_QUOTE_UPDATE}

    UNION ALL

    SELECT
        LQ.RequestNo,
        ISNULL(LQ.QuoteAmount, CAST(0 AS DECIMAL(18,2))) AS ScopedValue
    FROM LatestQuotePerOwnJob LQ
    INNER JOIN EnquiryMaster E ON E.RequestNo = LQ.RequestNo
    WHERE NOT EXISTS (
        SELECT 1
        FROM LatestProbPendingFunnelScope P
        WHERE P.RequestNo = LQ.RequestNo
          AND (
            UPPER(LTRIM(RTRIM(ISNULL(P.OwnJobName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(LQ.QuoteOwnJob, N''))))
            OR (
                LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))) = N''
                AND UPPER(LTRIM(RTRIM(ISNULL(P.QuoteOwnJob, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(LQ.QuoteOwnJob, N''))))
            )
          )
    )
      AND YEAR(COALESCE(LQ.LatestQuoteDate, E.EnquiryDate)) = @year
      ${safeQuarter ? `AND DATEPART(QUARTER, COALESCE(LQ.LatestQuoteDate, E.EnquiryDate)) = @quarterNums` : ''}
)
SELECT
    COUNT(*) AS Cnt,
    SUM(EnquiryMax) AS TotalValue
FROM (
    SELECT RequestNo, MAX(ScopedValue) AS EnquiryMax
    FROM PendingLines
    GROUP BY RequestNo
) pendingPerEnquiry
            `;
}

/** Probability job line must belong to selected company (and division / CC allow-list when set). */
function buildSalesReportProbOwnJobClause(request, divisions, companies = null, allowList = null) {
    const companyCount = hasReportFilterList(companies)
        ? bindReportFilterList(request, 'srCo', companies)
        : 0;
    if (!companyCount && !(allowList && allowList.length)) {
        return '';
    }
    let divFilter = '';
    if (hasReportFilterList(divisions)) {
        const divCount = bindReportFilterList(request, 'srDept', divisions);
        divFilter = ` AND ${sqlOrUpperTrimMatch('mefOJ.DepartmentName', 'srDept', divCount)} `;
    } else if (allowList && allowList.length) {
        divFilter = sqlMatchAllowedDivisions('mefOJ.DepartmentName', allowList);
    }
    const companyMatch = companyCount
        ? ` AND ${sqlOrTrimMatch('mefOJ.CompanyName', 'srCo', companyCount)} `
        : '';
    return ` AND EXISTS (
                SELECT 1
                FROM Master_EnquiryFor mefOJ
                WHERE LTRIM(RTRIM(ISNULL(mefOJ.DepartmentName, N''))) <> N''
                  ${companyMatch}
                  ${divFilter}
                  AND (
                    UPPER(LTRIM(RTRIM(ISNULL(P.OwnJobName, N'')))) = UPPER(LTRIM(RTRIM(mefOJ.DepartmentName)))
                    OR (
                        LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))) = N''
                        AND UPPER(LTRIM(RTRIM(ISNULL(P.QuoteOwnJob, N'')))) = UPPER(LTRIM(RTRIM(mefOJ.DepartmentName)))
                    )
                  )
              )`;
}

/**
 * Sales Pipeline funnel + Jobs Follow-up table: latest Probability row per enquiry **and job line**
 * within division/SE scope (same grain as Pending — sub-divisions under one lead job stay separate).
 */
function buildSalesReportFunnelLatestProbCte(wonPreparedByClause, probScopeClause, enquiryScopeClause, cteName = 'LatestProbFunnelScope') {
    return `
WITH ${cteName} AS (
    SELECT * FROM (
        SELECT P.*,
            ROW_NUMBER() OVER (
                PARTITION BY P.RequestNo, LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))), LTRIM(RTRIM(ISNULL(P.LeadJobName, N'')))
                ORDER BY P.UpdatedDateTime DESC, P.ID DESC
            ) AS __rn
        FROM dbo.Probability P
        INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
        WHERE 1 = 1
          ${wonPreparedByClause || ''}
          ${probScopeClause || ''}
          ${enquiryScopeClause || ''}
    ) __f WHERE __f.__rn = 1
)
`;
}

const SQL_FUNNEL_FOLLOWUP_STATUS = `(
    LTRIM(RTRIM(ISNULL(P.ProbabilityChance, ''))) <> ''
    AND LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%follow%'
)`;

/** Sales Pipeline funnel: max net quoted per enquiry per stage, then sum by probability %. */
function buildSalesReportProbabilityFunnelAggregateSql(funnelLatestProbCte, probDateExpr, safeQuarter) {
    const quarterClause = safeQuarter
        ? `AND DATEPART(QUARTER, ${probDateExpr}) = @quarterNums`
        : '';
    return `
            ${funnelLatestProbCte}
            SELECT
                MAX(Scoped.ProbabilityName) AS ProbabilityName,
                Scoped.ProbabilityPercentage,
                SUM(Scoped.EnquiryMaxValue) AS TotalValue,
                SUM(Scoped.EnquiryMaxValue * Scoped.EnquiryGrossMarginPct / 100.0) AS GrossMarginValue,
                CASE
                    WHEN SUM(Scoped.EnquiryMaxValue) > 0
                    THEN (SUM(Scoped.EnquiryMaxValue * Scoped.EnquiryGrossMarginPct / 100.0) / SUM(Scoped.EnquiryMaxValue)) * 100.0
                    ELSE AVG(Scoped.EnquiryGrossMarginPct)
                END AS GrossMarginPct,
                COUNT(*) AS Count
            FROM (
                SELECT
                    P.RequestNo,
                    MAX(LTRIM(RTRIM(ISNULL(P.ProbabilityChance, '')))) AS ProbabilityName,
                    ${SQL_PROB_CHANCE_PCT_EXPR} AS ProbabilityPercentage,
                    MAX(${SQL_FUNNEL_NET_QUOTED_VALUE}) AS EnquiryMaxValue,
                    AVG(CAST(ISNULL(P.GrossMargin, 0) AS DECIMAL(18, 4))) AS EnquiryGrossMarginPct
                FROM LatestProbFunnelScope P
                INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
                WHERE YEAR(${probDateExpr}) = @year
                  ${quarterClause}
                  AND ${SQL_FUNNEL_FOLLOWUP_STATUS}
                GROUP BY P.RequestNo, ${SQL_PROB_CHANCE_PCT_EXPR}
            ) Scoped
            WHERE Scoped.ProbabilityPercentage IS NOT NULL
            GROUP BY Scoped.ProbabilityPercentage
            ORDER BY Scoped.ProbabilityPercentage ASC
        `;
}

/** Latest Probability row per enquiry **and job line** (OwnJob + LeadJob) — Jobs table lists every line for Probability updates. */
const SQL_TOPJOB_LATEST_PROB_CTE = `
WITH LatestProb AS (
    SELECT * FROM (
        SELECT P.*,
            ROW_NUMBER() OVER (
                PARTITION BY P.RequestNo, LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))), LTRIM(RTRIM(ISNULL(P.LeadJobName, N'')))
                ORDER BY P.UpdatedDateTime DESC
            ) AS __rn
        FROM dbo.Probability P
    ) __lp WHERE __lp.__rn = 1
)
`;

/** Jobs table Division column — Probability OwnJobName, else QuoteOwnJob. */
const SQL_TOPJOB_OWNJOB_DIVISION = `LTRIM(RTRIM(COALESCE(
    NULLIF(LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))), N''),
    NULLIF(LTRIM(RTRIM(ISNULL(P.QuoteOwnJob, N''))), N''),
    N''
)))`;

/** Parse money stored as NVARCHAR on Probability (handles commas, BD prefix). */
const SQL_PROB_JOB_VALUE = `
CASE
  WHEN NULLIF(LTRIM(RTRIM(ISNULL(P.FinalJobValueBooked, ''))), '') IS NOT NULL
    THEN TRY_CONVERT(DECIMAL(18,2), REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(P.FinalJobValueBooked)), ',', ''), 'BD', ''), ' ', ''))
  ELSE TRY_CONVERT(DECIMAL(18,2), REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(P.TotalQuotedValue, '0'))), ',', ''), 'BD', ''), ' ', ''))
END`;

/** Won (sales KPI): FinalJobValueBooked only — no fallback to TotalQuotedValue. */
const SQL_PROB_WON_VALUE = `
ISNULL(TRY_CONVERT(DECIMAL(18,2), REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(P.FinalJobValueBooked, ''))), ',', ''), 'BD', ''), ' ', '')), 0)`;

/** Lost KPI: CompetitorPrice on the latest Probability row when that row is Lost. */
const SQL_PROB_COMPETITOR_PRICE = `
ISNULL(TRY_CONVERT(DECIMAL(18,2), REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(P.CompetitorPrice, ''))), ',', ''), 'BD', ''), ' ', '')), 0)`;

/** Follow-up KPI: sum NetQuotedValue from latest row when status indicates follow-up. */
const SQL_PROB_NETQUOTED_SUM = `
ISNULL(TRY_CONVERT(DECIMAL(18,2), REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(P.NetQuotedValue, '0'))), ',', ''), 'BD', ''), ' ', '')), 0)`;

/** MIN(TotalAmount) per enquiry — least quote when multiple customers. */
const SQL_MIN_QUOTE_AMOUNT = `(SELECT MIN(ISNULL(TotalAmount, 0)) FROM dbo.EnquiryQuotes Q_M WHERE Q_M.RequestNo = P.RequestNo)`;

const SQL_PROB_NETQUOTED_PARSED = `
NULLIF(TRY_CONVERT(DECIMAL(18,2), REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(P.NetQuotedValue, ''))), ',', ''), 'BD', ''), ' ', '')), 0)`;

/** Follow-up funnel/table: parsed NetQuotedValue (same as Jobs Follow-up table JobValue). */
const SQL_FUNNEL_NET_QUOTED_VALUE = `
ISNULL(
    ${SQL_PROB_NETQUOTED_PARSED},
    CAST(0 AS DECIMAL(18,2))
)`;

/** Latest quote amount per enquiry (for Pending rows with no Probability record). */
const SQL_LATEST_QUOTE_AMOUNT_PER_ENQUIRY = `
(
    SELECT TOP 1
        ISNULL(
            TRY_CONVERT(
                DECIMAL(18,2),
                REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EQ.TotalAmount, '0'))), ',', ''), 'BD', ''), ' ', '')
            ),
            0
        )
    FROM EnquiryQuotes EQ
    WHERE EQ.RequestNo = E.RequestNo
    ORDER BY
        ISNULL(EQ.QuoteNo, 0) DESC,
        ISNULL(EQ.UpdatedAt, EQ.QuoteDate) DESC,
        EQ.QuoteDate DESC
)`;

/** Latest quote date per enquiry (used for Pending rows without Probability). */
const SQL_LATEST_QUOTE_DATE_PER_ENQUIRY = `
(
    SELECT TOP 1 COALESCE(EQ.UpdatedAt, EQ.QuoteDate)
    FROM EnquiryQuotes EQ
    WHERE EQ.RequestNo = E.RequestNo
    ORDER BY
        ISNULL(EQ.QuoteNo, 0) DESC,
        ISNULL(EQ.UpdatedAt, EQ.QuoteDate) DESC,
        EQ.QuoteDate DESC
)`;

/** Year/quarter filter for pending probability-update rows (quote date before enquiry date). */
const SQL_PENDING_EVENT_DATE_EXPR = `COALESCE(P.UpdatedDateTime, P.ExpectedDate, ${SQL_LATEST_QUOTE_DATE_PER_ENQUIRY}, E.EnquiryDate)`;

/**
 * Lost / Follow-up (Won/Lost section): least EnquiryQuotes.TotalAmount per project,
 * else Probability.NetQuotedValue (parsed).
 */
const SQL_PROB_LOST_FOLLOW_VALUE = `
COALESCE(${SQL_MIN_QUOTE_AMOUNT}, ${SQL_PROB_NETQUOTED_PARSED}, CAST(0 AS DECIMAL(18,2)))`;

/**
 * Status treated as Won (UI uses exact "Won" — avoid LIKE '%won%' which matches "Not Won", etc.).
 */
const SQL_PROB_STATUS_WON_STRICT = `(
  LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) = 'won'
  OR (
    LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE 'won %'
    AND LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) NOT LIKE '%follow%'
    AND LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) NOT LIKE '%lost%'
  )
)`;

/** FinalJobValueBooked present and non-zero after parse. */
const SQL_PROB_HAS_FINAL_BOOKED_MONEY = `(
  NULLIF(LTRIM(RTRIM(ISNULL(P.FinalJobValueBooked, ''))), '') IS NOT NULL
  AND ISNULL(TRY_CONVERT(DECIMAL(18,2), REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(P.FinalJobValueBooked, ''))), ',', ''), 'BD', ''), ' ', '')), 0) <> 0
)`;

/** Booked / Won KPIs: explicit Won status AND captured final job value (not Follow-up with stray booked amount). */
const SQL_PROB_WON_FOR_METRICS = `${SQL_PROB_STATUS_WON_STRICT} AND ${SQL_PROB_HAS_FINAL_BOOKED_MONEY}`;

/** Non–CC: Probability.Status must be exactly Won (case-insensitive) + FinalJobValueBooked per business rule. */
const SQL_PROB_WON_NON_CC_METRICS =
    `LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) = 'won' AND ${SQL_PROB_HAS_FINAL_BOOKED_MONEY}`;

function getProbWonMetricsSql(req) {
    return req.salesReportNonCcScope === true ? SQL_PROB_WON_NON_CC_METRICS : SQL_PROB_WON_FOR_METRICS;
}

/** Whitelist → SQL fragment for Top Jobs table — EnquiryMaster (legacy). */
const TOP_JOB_BOOKED_STATUS_SQL = {
    Quoted: "E.Status IN ('Quoted', 'Quote', 'Pending')",
    Won: "E.Status = 'Won'",
    Lost: "E.Status = 'Lost'",
    Pending: "E.Status = 'Pending'",
    'Follow Up': "(E.Status IN ('Follow-up', 'FollowUp', 'Follow Up'))",
    'On Hold': "(E.Status IN ('On Hold', 'Hold', 'OnHold'))",
    Cancelled: "E.Status = 'Cancelled'",
    Retendered: "E.Status = 'Retendered'"
};

/** Top jobs / filters using latest Probability.Status (case-insensitive keywords). Won branch uses getProbWonMetricsSql(req). */
const TOP_JOB_PROB_STATUS_SQL = {
    Quoted: "((LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%quote%') OR (P.RequestNo IS NULL AND EXISTS (SELECT 1 FROM EnquiryQuotes EQ WHERE EQ.RequestNo = E.RequestNo)))",
    Won: "(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) = 'won')",
    Lost: "(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%lost%')",
    Pending: "((LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%pending%' OR LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%quote%') OR (P.RequestNo IS NULL AND EXISTS (SELECT 1 FROM EnquiryQuotes EQ WHERE EQ.RequestNo = E.RequestNo)))",
    'Follow Up': "(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%follow%')",
    'On Hold': "(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%hold%')",
    Cancelled: "(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%cancel%')",
    Retendered: "(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%retender%')"
};

function getTopJobBookedStatusWhere(raw) {
    const key = sanitizeInput(raw);
    if (key && TOP_JOB_BOOKED_STATUS_SQL[key]) return TOP_JOB_BOOKED_STATUS_SQL[key];
    return TOP_JOB_BOOKED_STATUS_SQL.Won;
}

function getTopJobProbStatusWhere(raw, req) {
    const key = sanitizeInput(raw);
    if (key === 'Won') return TOP_JOB_PROB_STATUS_SQL.Won;
    if (key && TOP_JOB_PROB_STATUS_SQL[key]) return TOP_JOB_PROB_STATUS_SQL[key];
    return TOP_JOB_PROB_STATUS_SQL.Won;
}

/** Job column for Top Jobs from Probability — aligns with Won/Lost dollar rules. */
function getTopJobProbValueExpr(topJobStatus) {
    const key = sanitizeInput(topJobStatus);
    if (key === 'Won') return `(${SQL_PROB_WON_VALUE})`;
    if (key === 'Quoted') return `COALESCE(${SQL_PROB_NETQUOTED_PARSED}, ${SQL_LATEST_QUOTE_AMOUNT_PER_ENQUIRY}, CAST(0 AS DECIMAL(18,2)))`;
    // Pending uses OwnJob-scoped quote amount in /top-job-booked (never enquiry-wide latest —
    // that pulled parent/sibling division totals while Quote Ref stayed on OwnJob).
    if (key === 'Pending') return `ISNULL(${SQL_PROB_NETQUOTED_PARSED}, CAST(0 AS DECIMAL(18,2)))`;
    if (key === 'Follow Up') return `ISNULL(${SQL_PROB_NETQUOTED_PARSED}, CAST(0 AS DECIMAL(18,2)))`;
    if (key === 'Lost') return `(${SQL_PROB_COMPETITOR_PRICE})`;
    return `(${SQL_PROB_JOB_VALUE})`;
}

/** Selected / logged-in SE for report widgets (ConcernedSE on enquiry — not quote/probability PreparedBy). */
function getSalesReportAssignedSeList(req, roles) {
    const forced = req.salesReportForceSeName && String(req.salesReportForceSeName).trim();
    if (forced) return [forced];
    if (hasReportFilterList(roles)) return roles;
    return null;
}

function sqlCseOwnJobDivisionMatchList(cseAlias, divisions, paramPrefix = 'srDept') {
    if (!hasReportFilterList(divisions)) return '1=1';
    const parts = divisions.map((_, i) => sqlCseOwnJobDivisionMatch(cseAlias, `@${paramPrefix}${i}`));
    return `(${parts.join(' OR ')})`;
}

function hasSalesReportJobDivisionScope(divisions, allowList) {
    return hasReportFilterList(divisions) || !!(allowList && allowList.length);
}

/** Limit EnquiryFor job rows to selected division(s) or CC-mail allow-list. */
function buildSalesReportJobHierarchyDivisionWhere(request, divisions, allowList, efAlias = 'EF') {
    const joinOn = `(${efAlias}.ItemName = mef.ItemName OR ${efAlias}.ItemName LIKE '%- ' + mef.ItemName OR ${efAlias}.ItemName LIKE '%-' + mef.ItemName)`;
    if (hasReportFilterList(divisions)) {
        const divCount = bindReportFilterList(request, 'srJobDiv', divisions);
        return `
            AND EXISTS (
                SELECT 1
                FROM Master_EnquiryFor mef
                WHERE ${joinOn}
                AND ${sqlOrTrimMatch('mef.DepartmentName', 'srJobDiv', divCount)}
            )
        `;
    }
    if (allowList && allowList.length) {
        bindSalesReportAllowedDivisions(request, allowList);
        return `
            AND EXISTS (
                SELECT 1
                FROM Master_EnquiryFor mef
                WHERE ${joinOn}
                ${sqlMatchAllowedDivisions('mef.DepartmentName', allowList)}
            )
        `;
    }
    return '';
}

/**
 * EnquiryMaster scope: non–CC → company + latest Probability.OwnJobName = division + ConcernedSE↔Master email;
 * CC / others → EnquiryFor division/company + optional ConcernedSE by name.
 * @param {object} [opts]
 * @param {boolean} [opts.omitEnquiryMasterDivisionForQuoteOwnJob] — Jobs (Quoted) only: do not require
 *   EnquiryFor / latest Probability division on EnquiryMaster; division is applied on `EnquiryQuotes.OwnJob`
 *   instead (avoids dropping enquiries that have BMS quotes but no BMS line in EnquiryFor).
 * @param {boolean} [opts.omitSeForQuoteOwnJob] — Jobs (Quoted) / quoted KPI: SE is applied on quote OwnJob
 *   via buildSalesReportQuoteAccountableSeClause (not enquiry-wide ConcernedSE).
 */
function appendSalesReportEnquiryFilters(req, request, companies, divisions, roles, opts = {}) {
    let filterClause = '';
    const isNonCcSalesScope = req.salesReportNonCcScope === true;
    const srUserEmail = req.salesReportUserEmail ? String(req.salesReportUserEmail).trim() : '';
    const omitMasterDivision =
        opts && opts.omitEnquiryMasterDivisionForQuoteOwnJob === true;
    const omitSeForQuoteOwnJob = opts && opts.omitSeForQuoteOwnJob === true;
    const allowList = resolveSalesReportDivisionAllowList(req, divisions);

    bindSalesReportCompanyDivision(request, companies, divisions, allowList);

    if (isNonCcSalesScope) {
        if (srUserEmail) {
            bindInputIfMissing(request, 'srUserEmail', sql.NVarChar, srUserEmail);
        }
        if (req.salesReportNonCcBlock === true) {
            filterClause += ' AND 1=0 ';
        } else if (!srUserEmail) {
            filterClause += ' AND 1=0 ';
        } else {
            if (!omitMasterDivision) {
                filterClause += sqlEnquiryForCompanyDivisionExists(request, companies, divisions, allowList);
            } else if (!hasReportFilterList(companies)) {
                filterClause += ' AND 1=0 ';
            } else {
                filterClause += sqlEnquiryForCompanyDivisionExists(request, companies, null, null);
            }
            if (hasReportFilterList(divisions) && !omitMasterDivision) {
                const divCount = bindReportFilterList(request, 'srProbDiv', divisions);
                filterClause += `
                  AND EXISTS (
                    SELECT 1
                    FROM (
                      SELECT P2.RequestNo, P2.OwnJobName,
                        ROW_NUMBER() OVER (PARTITION BY P2.RequestNo ORDER BY P2.UpdatedDateTime DESC) AS __rn
                      FROM dbo.Probability P2
                    ) lp
                    WHERE lp.__rn = 1
                      AND lp.RequestNo = E.RequestNo
                      AND ${sqlOrUpperTrimMatch('ISNULL(lp.OwnJobName, N\'\')', 'srProbDiv', divCount)}
                  ) `;
            }
            if (!omitSeForQuoteOwnJob) {
                filterClause += `
                  AND EXISTS (
                    SELECT 1
                    FROM ConcernedSE cs
                    INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                    WHERE cs.RequestNo = E.RequestNo
                      AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(m.EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
                       = LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(@srUserEmail, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
                  ) `;
                filterClause += buildConcernedSeNameExistsClause(request, roles, 'srSeRole');
            }
        }
    } else {
        if (omitMasterDivision) {
            if (!hasReportFilterList(companies) && !(allowList && allowList.length)) {
                filterClause += ' AND 1=0 ';
            } else {
                filterClause += sqlEnquiryForCompanyDivisionExists(request, companies, null, null);
            }
        } else {
            filterClause += sqlEnquiryForCompanyDivisionExists(request, companies, divisions, allowList);
        }

        if (req.salesReportNonCcBlock === true) {
            filterClause += ' AND 1=0 ';
        } else if (!omitSeForQuoteOwnJob) {
            if (req.salesReportForceSeName) {
                bindInputIfMissing(request, 'se', sql.NVarChar, String(req.salesReportForceSeName).trim());
                filterClause += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = E.RequestNo AND LTRIM(RTRIM(cse.SEName)) = LTRIM(RTRIM(@se))) `;
            } else {
                filterClause += buildConcernedSeNameExistsClause(request, roles, 'srSe');
            }
        }
    }

    return filterClause;
}

/**
 * Shared request + item-value FROM clause for top-job table and /summary EnquiryMaster queries.
 * @returns {object|null}
 */
function buildSalesReportItemValueContext(req, enquiryScopeOpts) {
    const { year } = req.query;
    if (!year) return null;

    const { companies, divisions, roles } = resolveSalesReportFilterLists(req);
    const request = new sql.Request();
    const safeYear = year ? parseInt(year, 10) : null;
    const safeQuarter = (req.query.quarter && req.query.quarter !== 'All') ? String(req.query.quarter).trim() : null;
    let quarterNum = null;
    if (safeQuarter) quarterNum = parseInt(safeQuarter.replace('Q', ''), 10);

    request.input('year', sql.Int, safeYear);
    if (safeQuarter) {
        request.input('quarterNums', sql.Int, quarterNum);
        request.input('quarterStrs', sql.NVarChar, safeQuarter);
    }

    const filterClause = appendSalesReportEnquiryFilters(
        req,
        request,
        companies,
        divisions,
        roles,
        enquiryScopeOpts || {}
    );
    const allowList = resolveSalesReportDivisionAllowList(req, divisions);

    const effectiveSeForTargetList = getSalesReportAssignedSeList(req, roles);
    if (hasReportFilterList(effectiveSeForTargetList)) {
        bindReportFilterList(request, 'srSe', effectiveSeForTargetList);
    }

    const selectedCustomerApply = `
            OUTER APPLY (
                SELECT TOP 1 ToName 
                FROM EnquiryQuotes 
                WHERE RequestNo = E.RequestNo 
                ORDER BY 
                    CASE WHEN QuoteNumber = E.WonQuoteRef THEN 0 ELSE 1 END, 
                    UpdatedAt DESC
            ) SC
        `;

    let itemValueSQL = '';
    if (hasReportFilterList(divisions)) {
        const divCount = bindReportFilterList(request, 'srIvDiv', divisions);
        itemValueSQL = `
                 OUTER APPLY (
                     SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                     FROM EnquiryFor EF_Inner
                     JOIN Master_EnquiryFor MEF_Inner ON (EF_Inner.ItemName = MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '%- ' + MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '%-' + MEF_Inner.ItemName)
                     OUTER APPLY (
                         SELECT SUM(ISNULL(Price, 0)) as Price
                         FROM EnquiryPricingValues EPV
                         WHERE EPV.RequestNo = EF_Inner.RequestNo 
                           AND (EPV.EnquiryForID = EF_Inner.ID OR EPV.EnquiryForItem = EF_Inner.ItemName)
                           AND (EPV.CustomerName = SC.ToName OR SC.ToName IS NULL)
                     ) EPV
                     WHERE EF_Inner.RequestNo = E.RequestNo
                       AND ${sqlOrTrimMatch('MEF_Inner.DepartmentName', 'srIvDiv', divCount)}
                 ) ItemValue
             `;
    } else if (allowList && allowList.length) {
        const companyClause = hasReportFilterList(companies)
            ? ` AND ${sqlOrTrimMatch('MEF_Inner.CompanyName', 'srCo', bindReportFilterList(request, 'srCo', companies))} `
            : '';
        itemValueSQL = `
                 OUTER APPLY (
                     SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                     FROM EnquiryFor EF_Inner
                     JOIN Master_EnquiryFor MEF_Inner ON (EF_Inner.ItemName = MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '%- ' + MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '%-' + MEF_Inner.ItemName)
                     OUTER APPLY (
                         SELECT SUM(ISNULL(Price, 0)) as Price
                         FROM EnquiryPricingValues EPV
                         WHERE EPV.RequestNo = EF_Inner.RequestNo 
                           AND (EPV.EnquiryForID = EF_Inner.ID OR EPV.EnquiryForItem = EF_Inner.ItemName)
                           AND (EPV.CustomerName = SC.ToName OR SC.ToName IS NULL)
                     ) EPV
                     WHERE EF_Inner.RequestNo = E.RequestNo
                       ${companyClause}
                       ${sqlMatchAllowedDivisions('MEF_Inner.DepartmentName', allowList)}
                 ) ItemValue
             `;
    } else {
        itemValueSQL = `
                 OUTER APPLY (
                     SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                     FROM EnquiryFor EF_Inner
                     OUTER APPLY (
                         SELECT SUM(ISNULL(Price, 0)) as Price
                         FROM EnquiryPricingValues EPV
                         WHERE EPV.RequestNo = EF_Inner.RequestNo 
                           AND (EPV.EnquiryForID = EF_Inner.ID OR EPV.EnquiryForItem = EF_Inner.ItemName)
                           AND (EPV.CustomerName = SC.ToName OR SC.ToName IS NULL)
                     ) EPV
                     WHERE EF_Inner.RequestNo = E.RequestNo
                       AND (EF_Inner.ParentID IS NULL OR EF_Inner.ParentID = 0)
                 ) ItemValue
             `;
    }
    const itemValueApply = selectedCustomerApply + itemValueSQL;
    const itemValueCol = 'ISNULL(ItemValue.Total, 0)';

    return {
        request,
        filterClause,
        itemValueApply,
        itemValueCol,
        safeYear,
        companies,
        divisions,
        roles,
        allowList,
        effectiveSeForTargetList,
        nonCcBlock: req.salesReportNonCcBlock === true,
        salesReportNonCcScope: req.salesReportNonCcScope === true,
        safeQuarter,
        quarterNum,
    };
}

router.get('/company-by-division', async (req, res) => {
    try {
        const { division } = req.query;
        if (!division) return res.status(400).json({ error: 'Division is required' });

        const request = new sql.Request();
        request.input('division', sql.NVarChar, division);

        const result = await request.query(`
            SELECT TOP 1 CompanyName 
            FROM Master_EnquiryFor 
            WHERE DepartmentName = @division
        `);

        if (result.recordset.length > 0) {
            res.json({ company: result.recordset[0].CompanyName });
        } else {
            res.json({ company: '' });
        }
    } catch (err) {
        console.error('Error fetching company for division:', err);
        res.status(500).json({ error: 'Failed to fetch company' });
    }
});

router.get('/user-access-details', async (req, res) => {
    try {
        const { email: rawEmail } = req.query;
        if (!rawEmail) return res.status(400).json({ error: 'Email is required' });
        const email = rawEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim();

        const request = new sql.Request();
        request.input('email', sql.NVarChar, email);

        // 1. Fetch User Details
        const userRes = await request.query(`
            SELECT FullName, Designation, Department 
            FROM Master_ConcernedSE 
            WHERE EmailId = @email
        `);

        if (userRes.recordset.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userRes.recordset[0];
        const userDepartmentCsv = (user.Department || '').trim();
        const userDeptTokens = parseUserDepartments(userDepartmentCsv);
        const userFullName = (user.FullName || '').trim();

        const ccReq = new sql.Request();
        ccReq.input('email', sql.NVarChar, email);
        const ccRes = await ccReq.query(`
            SELECT TOP 1 1 AS Found
            FROM Master_EnquiryFor
            WHERE ',' + REPLACE(REPLACE(ISNULL(CCMailIds, ''), ' ', ''), ';', ',') + ','
                  LIKE '%,' + REPLACE(REPLACE(@email, ' ', ''), ';', ',') + ',%'
        `);
        const accessCtx = await resolveSalesReportAccess(email);
        const filtersUnlocked = userHasUnlockedReportFilters(accessCtx);
        const isCcMailMember = (ccRes.recordset || []).length > 0;
        const scopedCcFilters = userIsCcMailReportScoped(accessCtx) || (isCcMailMember && !filtersUnlocked);

        let company = '';
        let departmentName = userDeptTokens[0] || '';
        for (const dept of userDeptTokens) {
            const companyReq = new sql.Request();
            companyReq.input('dept', sql.NVarChar, dept);
            const companyRes = await companyReq.query(`
                 SELECT TOP 1 CompanyName, DepartmentName
                 FROM Master_EnquiryFor
                 WHERE DepartmentName = @dept
            `);
            if (companyRes.recordset.length > 0) {
                company = (companyRes.recordset[0].CompanyName || '').trim();
                departmentName = (companyRes.recordset[0].DepartmentName || dept).trim();
                if (company) break;
            }
        }

        // Assigned-only SE: lock all three. CC-mail: scoped lists from /filters, SE selectable. Admin/Management: full access.
        const lockCompanyDivisionRole = !filtersUnlocked && !scopedCcFilters;
        res.json({
            lockCompanyDivisionRole,
            lockRole: lockCompanyDivisionRole,
            scopedCcFilters,
            isCcMember: isCcMailMember,
            company: company || '',
            division: departmentName || '',
            divisions: userDeptTokens,
            role: userFullName || ''
        });

    } catch (err) {
        console.error('Error fetching user access details:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

router.get('/filters', async (req, res) => {
    try {
        const { company, division, email: rawEmail } = req.query;
        const request = new sql.Request();
        const scopedEmail = sanitizeInput(rawEmail)
            ? String(rawEmail).toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim()
            : null;

        // 1. Years (Always distinct from EnquiryMaster)
        const yearQuery = `
            SELECT DISTINCT YEAR(EnquiryDate) as Year 
            FROM EnquiryMaster 
            WHERE EnquiryDate IS NOT NULL 
            ORDER BY Year DESC
        `;

        const years = await new sql.Request().query(yearQuery);

        const scopedAccessCtx = scopedEmail ? await resolveSalesReportAccess(scopedEmail) : null;
        const scopedFiltersUnlocked = userHasUnlockedReportFilters(scopedAccessCtx);

        if (!scopedEmail || scopedFiltersUnlocked) {
            const companyQuery = `
                SELECT DISTINCT CompanyName 
                FROM Master_EnquiryFor 
                WHERE CompanyName IS NOT NULL AND CompanyName <> ''
                ORDER BY CompanyName ASC
            `;
            const qCompanies = parseReportFilterList(company);
            const qDivisions = parseReportFilterList(division);
            let divisionSQL = `
                SELECT DISTINCT DepartmentName 
                FROM Master_EnquiryFor 
                WHERE DepartmentName IS NOT NULL AND DepartmentName <> ''
            `;
            if (hasReportFilterList(qCompanies)) {
                const coCount = bindReportFilterList(request, 'fCo', qCompanies);
                divisionSQL += ` AND ${sqlOrTrimMatch('CompanyName', 'fCo', coCount)} `;
            }
            divisionSQL += ` ORDER BY DepartmentName ASC`;

            let roleSQL = `
                SELECT DISTINCT SE.FullName 
                FROM Master_ConcernedSE SE
                INNER JOIN Master_EnquiryFor M ON (
                    LTRIM(RTRIM(M.DepartmentName)) = LTRIM(RTRIM(SE.Department))
                    OR N',' + REPLACE(LTRIM(RTRIM(ISNULL(SE.Department, N''))), N' ', N'') + N','
                       LIKE N'%,' + REPLACE(LTRIM(RTRIM(ISNULL(M.DepartmentName, N''))), N' ', N'') + N',%'
                )
                WHERE SE.FullName IS NOT NULL AND SE.FullName <> ''
            `;
            if (hasReportFilterList(qCompanies)) {
                const coCount = bindReportFilterList(request, 'fCo', qCompanies);
                roleSQL += ` AND ${sqlOrTrimMatch('M.CompanyName', 'fCo', coCount)} `;
            }
            if (hasReportFilterList(qDivisions)) {
                const divCount = bindReportFilterList(request, 'fDiv', qDivisions);
                const divParts = [];
                for (let i = 0; i < divCount; i++) {
                    divParts.push(sqlMasterDepartmentContains('SE.Department', `fDiv${i}`));
                }
                roleSQL += ` AND (${divParts.join(' OR ')}) `;
            }
            roleSQL += ` ORDER BY SE.FullName ASC`;

            const [companies, divisions, roles] = await Promise.all([
                new sql.Request().query(companyQuery),
                request.query(divisionSQL),
                request.query(roleSQL)
            ]);

            return res.json({
                years: years.recordset.map(r => r.Year),
                companies: companies.recordset.map(r => r.CompanyName),
                divisions: divisions.recordset.map(r => r.DepartmentName),
                roles: roles.recordset.map(r => r.FullName)
            });
        }

        const userReq = new sql.Request();
        userReq.input('email', sql.NVarChar, scopedEmail);
        const userRes = await userReq.query(`
            SELECT TOP 1 FullName, Department
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = LOWER(LTRIM(RTRIM(@email)))
        `);
        const user = (userRes.recordset || [])[0] || { FullName: '', Department: '' };
        const userDeptTokens = parseUserDepartments(user.Department || '');
        const userFullName = (user.FullName || '').trim();

        const scopedPairs = await fetchCcMailScopedPairs(scopedEmail);
        const isCcMember = scopedPairs.length > 0;

        if (!isCcMember) {
            let lockedCompany = '';
            for (const dept of userDeptTokens) {
                const cReq = new sql.Request();
                cReq.input('dept', sql.NVarChar, dept);
                const cRes = await cReq.query(`
                    SELECT TOP 1 CompanyName
                    FROM Master_EnquiryFor
                    WHERE DepartmentName = @dept
                `);
                lockedCompany = ((cRes.recordset || [])[0]?.CompanyName || '').trim();
                if (lockedCompany) break;
            }
            return res.json({
                years: years.recordset.map(r => r.Year),
                companies: lockedCompany ? [lockedCompany] : [],
                divisions: userDeptTokens,
                roles: userFullName ? [userFullName] : []
            });
        }

        const qCompanies = parseReportFilterList(company);
        const qDivisions = parseReportFilterList(division);

        const companies = [...new Set(scopedPairs.map(r => r.company).filter(Boolean))].sort();

        const divisionSource = hasReportFilterList(qCompanies)
            ? scopedPairs.filter((p) => qCompanies.includes(p.company))
            : scopedPairs;
        const divisions = [...new Set(divisionSource.map((r) => r.division).filter(Boolean))].sort();

        let departmentsForRoles = [];
        if (hasReportFilterList(qDivisions)) {
            departmentsForRoles = qDivisions.filter((d) =>
                divisionSource.some((p) => p.division === d)
            );
        } else if (hasReportFilterList(qCompanies)) {
            departmentsForRoles = [...new Set(divisionSource.map((r) => r.division).filter(Boolean))];
        } else {
            departmentsForRoles = [...new Set(scopedPairs.map((r) => r.division).filter(Boolean))];
        }

        let roles = [];
        if (departmentsForRoles.length > 0) {
            const roleReq = new sql.Request();
            const divisionList = departmentsForRoles.map((d, i) => {
                const key = `d${i}`;
                roleReq.input(key, sql.NVarChar, d);
                return `@${key}`;
            }).join(', ');
            const roleRes = await roleReq.query(`
                SELECT DISTINCT FullName
                FROM Master_ConcernedSE
                WHERE FullName IS NOT NULL
                  AND FullName <> ''
                  AND Department IN (${divisionList})
                ORDER BY FullName ASC
            `);
            roles = roleRes.recordset.map(r => r.FullName);
        }

        res.json({
            years: years.recordset.map(r => r.Year),
            companies,
            divisions,
            roles
        });

    } catch (err) {
        console.error('Error fetching Sales Report filters:', err);
        res.status(500).json({ error: 'Failed to fetch filters' });
    }
});

router.get('/summary', async (req, res) => {
    try {
        const __srAllT0 = Date.now();
        await applySalesReportEmailScope(req);
        const ctx = buildSalesReportItemValueContext(req);
        if (!ctx) return res.status(400).json({ error: 'Year is required' });

        const {
            request,
            filterClause,
            itemValueApply,
            itemValueCol,
            safeYear,
            companies,
            divisions,
            roles,
            allowList,
            effectiveSeForTargetList,
            nonCcBlock,
            safeQuarter,
            quarterNum
        } = ctx;

        const probDateExpr =
            'COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime, E.EnquiryDate)';
        const effectiveQuotedSeList = getSalesReportAssignedSeList(req, roles);
        bindSalesReportCompanyDivision(request, companies, divisions, allowList);
        const quotedFilterClause = buildSalesReportEnquiryScopeClause({
            request,
            nonCcBlock,
            companies,
            divisions,
            effectiveSeList: effectiveQuotedSeList,
            accountableSeOnly: false,
            allowList,
        });
        /** Won / Lost / Follow-up KPIs: only the accountable SE per enquiry + ownjob (+ leadjob) counts. */
        const quotedAchievementScopeClause = buildSalesReportEnquiryScopeClause({
            request,
            nonCcBlock,
            companies,
            divisions,
            effectiveSeList: effectiveQuotedSeList,
            accountableSeOnly: true,
            allowList,
        });

        /** SE scope on enquiry (ConcernedSE) is in quotedFilterClause — not Probability.PreparedBy. */
        const wonPreparedByClause = '';
        const probDivisionScopeClause = buildSalesReportProbOwnJobClause(
            request,
            divisions,
            companies,
            allowList
        );
        const probPartitionByExpr = hasReportFilterList(effectiveQuotedSeList)
            ? `P.RequestNo, LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))), LTRIM(RTRIM(ISNULL(P.LeadJobName, N'')))`
            : `P.RequestNo, LTRIM(RTRIM(ISNULL(P.PreparedBy, '')))`;
        const quotePartitionByExpr = hasReportFilterList(effectiveQuotedSeList)
            ? `EQ.RequestNo`
            : `EQ.RequestNo, LTRIM(RTRIM(ISNULL(EQ.PreparedBy, '')))`;

        /** Latest Probability row per enquiry by UpdatedDateTime (any status) — Won/Lost KPIs use this row only. */
        const latestProbByUpdateCte = `
WITH LatestProbByUpdate AS (
    SELECT * FROM (
        SELECT P.*,
            ROW_NUMBER() OVER (PARTITION BY ${probPartitionByExpr} ORDER BY P.UpdatedDateTime DESC) AS __rn
        FROM dbo.Probability P
        INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
        WHERE 1 = 1
          ${wonPreparedByClause}
          ${probDivisionScopeClause}
          ${quotedAchievementScopeClause}
    ) __lr WHERE __lr.__rn = 1
)
`;

        const wonMetricsSql = getProbWonMetricsSql(req);

        // 1. Target vs Job Booked — target from SalesTargets (All SE = sum every SalesEngineer row in division)
        let targetFilter = ' WHERE FinancialYear = @year ';
        if (nonCcBlock) {
            targetFilter += ' AND 1=0 ';
        } else {
            if (hasReportFilterList(companies)) {
                bindReportFilterList(request, 'srTgtCo', companies);
                targetFilter += ` AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefT
                    WHERE ${sqlOrTrimMatch('mefT.CompanyName', 'srTgtCo', companies.length)}
                      AND (
                        LTRIM(RTRIM(ISNULL(mefT.DepartmentName, ''))) = LTRIM(RTRIM(ISNULL(SalesTargets.Division, '')))
                        OR LTRIM(RTRIM(ISNULL(mefT.ItemName, ''))) = LTRIM(RTRIM(ISNULL(SalesTargets.Division, '')))
                      )
                ) `;
            }
            if (hasReportFilterList(divisions)) {
                bindReportFilterList(request, 'srTgtDiv', divisions);
                targetFilter += buildSalesTargetsDivisionClause(divisions, 'srTgtDiv');
            } else if (allowList && allowList.length) {
                targetFilter += sqlMatchAllowedDivisions('SalesTargets.Division', allowList);
            }
            if (hasReportFilterList(effectiveSeForTargetList)) {
                bindReportFilterList(request, 'srTgtSe', effectiveSeForTargetList);
                targetFilter += buildSalesTargetsSeClause(effectiveSeForTargetList, 'srTgtSe');
            }
        }
        if (safeQuarter) targetFilter += ' AND Quarter = @quarterStrs ';

        const quotedTableFilterClause = appendSalesReportEnquiryFilters(
            req,
            request,
            companies,
            divisions,
            roles,
            { omitEnquiryMasterDivisionForQuoteOwnJob: true, omitSeForQuoteOwnJob: true }
        );
        const quotedSeAccountableClause = hasReportFilterList(effectiveQuotedSeList)
            ? buildSalesReportQuoteAccountableSeClause(request, effectiveQuotedSeList, 'srSeQ', 'EQ')
            : '';
        const funnelProbScopeClause = buildSalesReportProbOwnJobClause(
            request,
            divisions,
            companies,
            allowList
        );
        const funnelLatestProbCte = buildSalesReportFunnelLatestProbCte(
            wonPreparedByClause,
            funnelProbScopeClause,
            quotedAchievementScopeClause
        );
        const probKpiSql = `
WITH LatestProbByUpdate AS (
    SELECT * FROM (
        SELECT P.*,
            ROW_NUMBER() OVER (PARTITION BY ${probPartitionByExpr} ORDER BY P.UpdatedDateTime DESC) AS __rn
        FROM dbo.Probability P
        INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
        WHERE 1 = 1
          ${wonPreparedByClause}
          ${probDivisionScopeClause}
          ${quotedAchievementScopeClause}
    ) __lr WHERE __lr.__rn = 1
),
ProbBase AS (
    SELECT
        P.*,
        E.RequestNo AS E_RequestNo,
        COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate) AS BookedEventDate,
        ${probDateExpr} AS ProbEventDate,
        LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) AS StatusNorm,
        ${SQL_PROB_WON_VALUE} AS WonValue,
        ${SQL_PROB_COMPETITOR_PRICE} AS LostValue,
        ${SQL_FUNNEL_NET_QUOTED_VALUE} AS FollowUpQuotedValue,
        CAST(ISNULL(P.GrossMargin, 0) AS DECIMAL(18, 4)) AS GrossMarginPct
    FROM LatestProbByUpdate P
    INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
    WHERE YEAR(COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @year
      ${safeQuarter ? `AND DATEPART(QUARTER, COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @quarterNums` : ''}
),
FuScoped AS (
    SELECT
        E_RequestNo AS RequestNo,
        MAX(FollowUpQuotedValue) AS ScopedValue
    FROM ProbBase
    WHERE StatusNorm LIKE '%follow%'
      AND YEAR(ProbEventDate) = @year
      ${safeQuarter ? `AND DATEPART(QUARTER, ProbEventDate) = @quarterNums` : ''}
    GROUP BY E_RequestNo
)
SELECT
    N'WINLOSS' AS Section,
    CAST(NULL AS INT) AS Q,
    SUM(CASE WHEN StatusNorm = 'won' THEN 1 ELSE 0 END) AS WonCnt,
    SUM(CASE WHEN StatusNorm = 'won' THEN WonValue ELSE 0 END) AS WonTotal,
    SUM(CASE WHEN StatusNorm LIKE '%lost%' THEN 1 ELSE 0 END) AS LostCnt,
    SUM(CASE WHEN StatusNorm LIKE '%lost%' THEN LostValue ELSE 0 END) AS LostTotal,
    AVG(CASE WHEN StatusNorm = 'won' THEN GrossMarginPct END) AS AvgBookedGpPct,
    CAST(NULL AS DECIMAL(18, 2)) AS TotalActual,
    CAST(NULL AS DECIMAL(18, 2)) AS GmActual,
    CAST(NULL AS INT) AS FuCnt,
    CAST(NULL AS DECIMAL(18, 2)) AS FuTotal
FROM ProbBase
UNION ALL
SELECT
    N'QTR' AS Section,
    DATEPART(QUARTER, BookedEventDate) AS Q,
    CAST(NULL AS INT),
    CAST(NULL AS DECIMAL(18, 2)),
    CAST(NULL AS INT),
    CAST(NULL AS DECIMAL(18, 2)),
    AVG(GrossMarginPct) AS AvgBookedGpPct,
    SUM(WonValue) AS TotalActual,
    SUM(WonValue * GrossMarginPct / 100.0) AS GmActual,
    CAST(NULL AS INT),
    CAST(NULL AS DECIMAL(18, 2))
FROM ProbBase
WHERE StatusNorm = 'won'
GROUP BY DATEPART(QUARTER, BookedEventDate)
UNION ALL
SELECT
    N'FOLLOWUP' AS Section,
    CAST(NULL AS INT) AS Q,
    CAST(NULL AS INT),
    CAST(NULL AS DECIMAL(18, 2)),
    CAST(NULL AS INT),
    CAST(NULL AS DECIMAL(18, 2)),
    CAST(NULL AS DECIMAL(18, 4)),
    CAST(NULL AS DECIMAL(18, 2)),
    CAST(NULL AS DECIMAL(18, 2)),
    CAST(NULL AS INT) AS FuCnt,
    SUM(ISNULL(ScopedValue, 0)) AS FuTotal
FROM FuScoped;
        `;

        /* Pending/10% pipeline is loaded via /pipeline-pending (was ~3–5s and blocked charts). */
        const [
            targetBundleRes,
            probKpiBundle,
            quotedRes,
            probabilityFunnelResRaw,
        ] = await Promise.all([
            cloneMssqlRequest(request).query(`
                SELECT Quarter, SUM(ISNULL(TargetValue, 0)) as TotalTarget,
                       SUM(ISNULL(TargetValue, 0) * ISNULL(GrossProfitTarget, 0) / 100.0) AS GmTarget,
                       SUM(ISNULL(TargetValue, 0)) AS TotalSalesTarget
                FROM SalesTargets
                ${targetFilter}
                GROUP BY Quarter
            `),
            cloneMssqlRequest(request).query(probKpiSql).catch((e) => {
                console.warn('[Sales Report] Probability KPI bundle fallback:', e.message);
                return null;
            }),
            cloneMssqlRequest(request).query(
                buildQuotedMaxPerEnquiryKpiSql(
                    request,
                    quotedTableFilterClause,
                    divisions,
                    safeQuarter,
                    companies,
                    allowList,
                    quotedSeAccountableClause
                )
            ),
            cloneMssqlRequest(request)
                .query(
                    buildSalesReportProbabilityFunnelAggregateSql(
                        funnelLatestProbCte,
                        probDateExpr,
                        safeQuarter
                    )
                )
                .catch((pfErr) => {
                    console.warn('[Sales Report] Funnel Probability fallback:', pfErr.message);
                    return { recordset: [] };
                }),
        ]);
        if (process.env.EMS_SR_TIMING === '1') {
            console.log(`[Sales Report summary] ${Date.now() - __srAllT0}ms`);
        }

        const targetRes = {
            recordset: (targetBundleRes.recordset || []).map((r) => ({
                Quarter: r.Quarter,
                TotalTarget: r.TotalTarget,
            })),
        };
        const gmTargetRes = {
            recordset: (targetBundleRes.recordset || []).map((r) => ({
                Quarter: r.Quarter,
                TotalTarget: r.GmTarget,
                TotalSalesTarget: r.TotalSalesTarget,
            })),
        };

        let actualRes = { recordset: [] };
        let gmActualRes = { recordset: [] };
        let avgWonBookedGpPct = null;
        let wonKpiRes = { recordset: [{ Cnt: 0, TotalValue: 0 }] };
        let lostKpiRes = { recordset: [{ Cnt: 0, TotalValue: 0 }] };
        let followUpKpiRes = { recordset: [{ Cnt: 0, TotalValue: 0 }] };
        if (probKpiBundle) {
            const bundleRows = probKpiBundle.recordset || [];
            const kpiRow = bundleRows.find((r) => r.Section === 'WINLOSS') || {};
            wonKpiRes = {
                recordset: [{ Cnt: Number(kpiRow.WonCnt) || 0, TotalValue: Number(kpiRow.WonTotal) || 0 }]
            };
            lostKpiRes = {
                recordset: [{ Cnt: Number(kpiRow.LostCnt) || 0, TotalValue: Number(kpiRow.LostTotal) || 0 }]
            };
            if (kpiRow.AvgBookedGpPct != null) {
                avgWonBookedGpPct = Number(kpiRow.AvgBookedGpPct);
            }
            const qRows = bundleRows.filter((r) => r.Section === 'QTR');
            actualRes = { recordset: qRows.map((r) => ({ Q: r.Q, TotalActual: r.TotalActual })) };
            gmActualRes = { recordset: qRows.map((r) => ({ Q: r.Q, TotalActual: r.GmActual, AvgGpPct: r.AvgBookedGpPct })) };
            const fuRow = bundleRows.find((r) => r.Section === 'FOLLOWUP') || {};
            followUpKpiRes = {
                recordset: [{ Cnt: Number(fuRow.FuCnt) || 0, TotalValue: Number(fuRow.FuTotal) || 0 }]
            };
        } else {
            try {
                actualRes = await request.query(`
                SELECT DATEPART(QUARTER, ExpectedOrderDate) as Q, SUM(${itemValueCol}) as TotalActual
                FROM EnquiryMaster E
                ${itemValueApply}
                WHERE Status = 'Won' AND YEAR(ExpectedOrderDate) = @year ${filterClause}
                ${safeQuarter ? 'AND DATEPART(QUARTER, ExpectedOrderDate) = @quarterNums' : ''}
                GROUP BY DATEPART(QUARTER, ExpectedOrderDate)
            `);
            } catch (_) { /* keep empty */ }
        }

        let probabilityFunnelRes = probabilityFunnelResRaw || { recordset: [] };

        // Formatting data for frontend
        const quarters = [
            { name: 'Q1', target: 0, actual: 0 },
            { name: 'Q2', target: 0, actual: 0 },
            { name: 'Q3', target: 0, actual: 0 },
            { name: 'Q4', target: 0, actual: 0 }
        ];
        targetRes.recordset.forEach(r => {
            const idx = parseInt(r.Quarter.replace('Q', '')) - 1;
            if (quarters[idx]) quarters[idx].target = r.TotalTarget;
        });
        actualRes.recordset.forEach(r => {
            if (quarters[r.Q - 1]) quarters[r.Q - 1].actual = r.TotalActual;
        });

        const gmQuarters = [
            { name: 'Q1', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0, actualAvgGpPct: null },
            { name: 'Q2', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0, actualAvgGpPct: null },
            { name: 'Q3', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0, actualAvgGpPct: null },
            { name: 'Q4', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0, actualAvgGpPct: null }
        ];
        (gmTargetRes.recordset || []).forEach(r => {
            const idx = parseInt(String(r.Quarter || '').replace('Q', ''), 10) - 1;
            if (!gmQuarters[idx]) return;
            const gpMoney = Number(r.TotalTarget) || 0;
            const salesBase = Number(r.TotalSalesTarget) || 0;
            gmQuarters[idx].target = gpMoney;
            gmQuarters[idx].targetSalesBase = salesBase;
            gmQuarters[idx].targetGpPct = salesBase > 0 ? (gpMoney / salesBase) * 100 : 0;
        });
        (gmActualRes.recordset || []).forEach(r => {
            const idx = r.Q - 1;
            if (!gmQuarters[idx]) return;
            gmQuarters[idx].actual = r.TotalActual;
            if (r.AvgGpPct != null && Number.isFinite(Number(r.AvgGpPct))) {
                gmQuarters[idx].actualAvgGpPct = Number(r.AvgGpPct);
            }
        });

        const winLoss = {
            won: 0,
            lost: 0,
            followUp: 0,
            wonValue: 0,
            lostValue: 0,
            followUpValue: 0
        };
        const wonKpiRow = (wonKpiRes.recordset && wonKpiRes.recordset[0]) || {};
        winLoss.won = Number(wonKpiRow.Cnt) || 0;
        winLoss.wonValue = Number(wonKpiRow.TotalValue) || 0;
        const lostKpiRow = (lostKpiRes.recordset && lostKpiRes.recordset[0]) || {};
        winLoss.lost = Number(lostKpiRow.Cnt) || 0;
        winLoss.lostValue = Number(lostKpiRow.TotalValue) || 0;
        const followUpKpiRow = (followUpKpiRes.recordset && followUpKpiRes.recordset[0]) || {};
        winLoss.followUp = Number(followUpKpiRow.Cnt) || 0;
        winLoss.followUpValue = Number(followUpKpiRow.TotalValue) || 0;
        const q0 = (quotedRes.recordset && quotedRes.recordset[0]) || {};
        winLoss.quoted = q0.Cnt || 0;
        winLoss.quotedValue = q0.TotalValue || 0;

        res.json({
            targetVsActual: quarters,
            grossMarginTargetVsActual: gmQuarters,
            avgWonBookedGpPct,
            winLoss: winLoss,
            probabilityFunnel: probabilityFunnelRes.recordset
        });

    } catch (err) {
        console.error('Error fetching Sales Report summary:', err);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

/**
 * Pipeline “Pending / 10% Quoted” bucket only — heavy query kept off /summary so charts load first.
 * Frontend merges { totalValue, count } into probabilityFunnel (10%).
 */
router.get('/pipeline-pending', async (req, res) => {
    try {
        await applySalesReportEmailScope(req);
        const ctx = buildSalesReportItemValueContext(req);
        if (!ctx) return res.status(400).json({ error: 'Year is required' });

        const {
            request,
            companies,
            divisions,
            roles,
            allowList,
            nonCcBlock,
            safeQuarter,
        } = ctx;
        const effectiveQuotedSeList = getSalesReportAssignedSeList(req, roles);
        bindSalesReportCompanyDivision(request, companies, divisions, allowList);

        const pendingAggregateSql = buildSalesReportPendingQuotedAggregateSql({
            probDateExpr: SQL_PENDING_EVENT_DATE_EXPR,
            safeQuarter,
            pendingScopeClause: buildSalesReportPendingScopeClause({
                request,
                nonCcBlock,
                companies,
                divisions,
                effectiveSeList: effectiveQuotedSeList,
                allowList,
            }),
            pendingQuoteScopeClause: buildSalesReportPendingQuoteScopeClause({
                request,
                nonCcBlock,
                companies,
                divisions,
                effectiveSeList: effectiveQuotedSeList,
                allowList,
            }),
            probOwnJobClause: buildSalesReportProbOwnJobClause(
                request,
                divisions,
                companies,
                allowList
            ),
            quoteOwnJobClause: buildSalesReportQuoteOwnJobDivisionClause(
                request,
                divisions,
                'EQ',
                companies,
                allowList
            ),
        });

        const t0 = Date.now();
        const pendingRes = await request.query(pendingAggregateSql);
        if (process.env.EMS_SR_TIMING === '1') {
            console.log(`[Sales Report pipeline-pending] ${Date.now() - t0}ms`);
        }
        const row = (pendingRes.recordset && pendingRes.recordset[0]) || {};
        res.json({
            totalValue: Number(row.TotalValue) || 0,
            count: Number(row.Cnt) || 0,
        });
    } catch (err) {
        console.error('Error fetching pipeline pending:', err);
        res.status(500).json({ error: 'Failed to fetch pipeline pending', totalValue: 0, count: 0 });
    }
});

/** Top Jobs table only — same filters as /summary; optional topJobStatus (Won, Lost, …). No full dashboard payload. */
router.get('/top-job-booked', async (req, res) => {
    try {
        await applySalesReportEmailScope(req);
        const topJobStatusKey = sanitizeInput(req.query.topJobStatus) || 'Won';
        const ctx = buildSalesReportItemValueContext(
            req,
            topJobStatusKey === 'Quoted'
                ? { omitEnquiryMasterDivisionForQuoteOwnJob: true, omitSeForQuoteOwnJob: true }
                : {}
        );
        if (!ctx) return res.status(400).json({ error: 'Year is required' });

        const { request, filterClause, itemValueApply, itemValueCol, safeQuarter, companies, divisions, roles, allowList, nonCcBlock } = ctx;
        const probDateExpr =
            'COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime, E.EnquiryDate)';
        const topJobProbWhere = getTopJobProbStatusWhere(req.query.topJobStatus, req);
        const topJobValueExpr = getTopJobProbValueExpr(req.query.topJobStatus);
        const topJobDateExpr = `COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime, ${SQL_LATEST_QUOTE_DATE_PER_ENQUIRY}, E.EnquiryDate)`;
        const effectiveQuotedSeList = getSalesReportAssignedSeList(req, roles);
        bindSalesReportCompanyDivision(request, companies, divisions, allowList);
        if (req.salesReportNonCcScope && req.salesReportUserEmail) {
            bindInputIfMissing(request, 'srUserEmail', sql.NVarChar, req.salesReportUserEmail);
        }
        const isQuotedTopJob = topJobStatusKey === 'Quoted';
        const isPendingTopJob = topJobStatusKey === 'Pending';
        const isFollowUpTopJob = topJobStatusKey === 'Follow Up';
        const isLostTopJob = topJobStatusKey === 'Lost';
        const isWonTopJob = topJobStatusKey === 'Won';
        let wonTopJobFilterClause = '';
        if (isWonTopJob) {
            if (nonCcBlock) {
                wonTopJobFilterClause += ' AND 1=0 ';
            } else {
                wonTopJobFilterClause += sqlEnquiryForCompanyDivisionExists(
                    request,
                    companies,
                    divisions,
                    allowList
                );
                if (hasReportFilterList(effectiveQuotedSeList)) {
                    wonTopJobFilterClause += buildSalesReportProbAccountableSeClause(
                        request,
                        effectiveQuotedSeList
                    );
                }
            }
        }
        let statusTopJobFilterClause = '';
        if (isLostTopJob || isFollowUpTopJob) {
            statusTopJobFilterClause = buildSalesReportEnquiryScopeClause({
                request,
                nonCcBlock,
                companies,
                divisions,
                effectiveSeList: effectiveQuotedSeList,
                accountableSeOnly: true,
                allowList,
            });
        }
        const pendingQuoteOwnJobClause = buildSalesReportQuoteOwnJobDivisionClause(
            request,
            divisions,
            'EQ',
            companies,
            allowList
        );
        let pendingTopJobProbScopeClause = '';
        let pendingTopJobEnquiryScopeClause = '';
        let pendingTopJobQuoteAccountableClause = '';
        if (isPendingTopJob) {
            pendingTopJobProbScopeClause = buildSalesReportPendingScopeClause({
                request,
                nonCcBlock,
                companies,
                divisions,
                effectiveSeList: effectiveQuotedSeList,
                allowList,
            });
            pendingTopJobEnquiryScopeClause = buildSalesReportPendingEnquiryScopeClause({
                request,
                nonCcBlock,
                companies,
                divisions,
                allowList,
            });
            pendingTopJobQuoteAccountableClause = hasReportFilterList(effectiveQuotedSeList)
                ? buildSalesReportQuoteAccountableSeClause(request, effectiveQuotedSeList, 'srSePend', 'EQ')
                : '';
        }
        const topJobScopeClause = isPendingTopJob ? pendingTopJobProbScopeClause : filterClause;

        let topJobBookedRes = { recordset: [] };
        try {
            if (isQuotedTopJob) {
                /**
                 * SE scope: only `filterClause` (ConcernedSE / non‑CC email). Never EnquiryQuotes.PreparedBy.
                 * Division: **`EnquiryQuotes.OwnJob`** via company (+ specific division or CC allow-list).
                 * Division=All for CC users must NOT expose every AAC department — only CCMailIds divisions.
                 * omitEnquiryMasterDivisionForQuoteOwnJob: company on EnquiryFor; OwnJob clause applies division.
                 * SE (when selected): accountable for that quote OwnJob — not merely ConcernedSE on any line.
                 */
                const quotedEqOwnJobExpr = `LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))`;
                const quotedOwnJobDivisionClause = buildSalesReportQuoteOwnJobDivisionClause(
                    request,
                    divisions,
                    'EQ',
                    companies,
                    allowList
                );
                const quotedSeAccountableClause = hasReportFilterList(effectiveQuotedSeList)
                    ? buildSalesReportQuoteAccountableSeClause(request, effectiveQuotedSeList, 'srSeQ', 'EQ')
                    : '';
                topJobBookedRes = await request.query(`
            WITH LatestQuoted AS (
                SELECT * FROM (
                    SELECT
                        EQ.RequestNo,
                        ${quotedEqOwnJobExpr} AS LeadJob,
                        EQ.ToName,
                        EQ.PreparedBy,
                        LTRIM(RTRIM(ISNULL(EQ.QuoteNumber, ''))) AS QuoteRef,
                        LTRIM(RTRIM(ISNULL(EQ.QuoteType, N''))) AS QuoteType,
                        COALESCE(EQ.UpdatedAt, EQ.QuoteDate) AS QuoteDate,
                        ISNULL(EQ.RevisionNo, 0) AS RevisionNo,
                        ISNULL(
                            TRY_CONVERT(
                                DECIMAL(18,2),
                                REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EQ.TotalAmount, '0'))), ',', ''), 'BD', ''), ' ', '')
                            ),
                            0
                        ) AS NetQuotedValue,
                        ROW_NUMBER() OVER (
                            PARTITION BY
                                EQ.RequestNo,
                                ${quotedEqOwnJobExpr},
                                LTRIM(RTRIM(ISNULL(EQ.ToName, N'')))
                            ORDER BY
                                ISNULL(EQ.QuoteNo, 0) DESC,
                                ISNULL(EQ.RevisionNo, 0) DESC,
                                ISNULL(EQ.UpdatedAt, EQ.QuoteDate) DESC,
                                EQ.QuoteDate DESC
                        ) AS __rn
                    FROM EnquiryQuotes EQ
                    INNER JOIN EnquiryMaster E ON E.RequestNo = EQ.RequestNo
                    WHERE 1 = 1
                      ${quotedOwnJobDivisionClause}
                      ${quotedSeAccountableClause}
                      ${filterClause}
                ) __lq
                WHERE __lq.__rn = 1
            )
            SELECT
                x.RequestNo,
                x.ProjectName,
                x.LeadJob,
                x.Division,
                x.JobValue,
                x.WonGrossProfit,
                x.Status,
                x.ProbabilityChance,
                x.ExpectedDate,
                x.LostToWhom,
                x.ReasonForLost,
                x.FollowUpRemarks,
                x.QuoteRef,
                x.QuoteDate,
                x.QuoteType,
                x.CustomerName,
                x.ClientName,
                x.ConsultantName,
                x.BookedDate,
                x.LostDate
            FROM (
                SELECT
                    E.RequestNo,
                    E.ProjectName,
                    LQ.LeadJob,
                    LTRIM(RTRIM(ISNULL(LQ.LeadJob, N''))) AS Division,
                    LQ.NetQuotedValue AS JobValue,
                    CAST(NULL AS DECIMAL(10,2)) AS WonGrossProfit,
                    'Quoted' AS Status,
                    CAST(NULL AS NVARCHAR(120)) AS ProbabilityChance,
                    CAST(NULL AS DATETIME) AS ExpectedDate,
                    CAST(NULL AS NVARCHAR(255)) AS LostToWhom,
                    CAST(NULL AS NVARCHAR(1000)) AS ReasonForLost,
                    CAST(NULL AS NVARCHAR(MAX)) AS FollowUpRemarks,
                    LTRIM(RTRIM(ISNULL(LQ.ToName, ISNULL(E.WonCustomerName, E.CustomerName)))) AS CustomerName,
                    E.ClientName,
                    E.ConsultantName,
                    LQ.QuoteRef,
                    LQ.QuoteDate,
                    LQ.QuoteType,
                    CAST(NULL AS DATETIME) AS BookedDate,
                    CAST(NULL AS DATETIME) AS LostDate
                FROM EnquiryMaster E
                INNER JOIN LatestQuoted LQ ON E.RequestNo = LQ.RequestNo
                WHERE YEAR(COALESCE(LQ.QuoteDate, E.EnquiryDate)) = @year ${filterClause}
                  ${safeQuarter ? `AND DATEPART(QUARTER, COALESCE(LQ.QuoteDate, E.EnquiryDate)) = @quarterNums` : ''}
            ) x
            ORDER BY x.JobValue DESC
            `);
            } else if (isWonTopJob) {
                const wonProbWhere = getProbWonMetricsSql(req);
                const wonPreparedByClause = '';
                const wonOwnJobClause = buildSalesReportProbOwnJobClause(request, divisions, companies, allowList);
                topJobBookedRes = await request.query(`
            WITH LatestProbWonScope AS (
                SELECT * FROM (
                    SELECT
                        P.*,
                        ROW_NUMBER() OVER (
                            PARTITION BY P.RequestNo, LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))), LTRIM(RTRIM(ISNULL(P.LeadJobName, N'')))
                            ORDER BY P.UpdatedDateTime DESC
                        ) AS __rn
                    FROM dbo.Probability P
                    INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
                    WHERE 1 = 1
                      ${wonPreparedByClause}
                      ${wonOwnJobClause}
                      ${wonTopJobFilterClause}
                ) __lw
                WHERE __lw.__rn = 1
            )
            SELECT
                x.RequestNo,
                x.ProjectName,
                x.LeadJob,
                x.Division,
                x.JobValue,
                x.WonGrossProfit,
                x.Status,
                x.ProbabilityChance,
                x.ExpectedDate,
                x.LostToWhom,
                x.ReasonForLost,
                x.FollowUpRemarks,
                x.QuoteRef,
                x.QuoteDate,
                x.CustomerName,
                x.ClientName,
                x.ConsultantName,
                x.BookedDate,
                x.LostDate,
                x.QuoteType,
                x.LeadJobCode
            FROM (
                SELECT
                    E.RequestNo,
                    E.ProjectName,
                    LTRIM(RTRIM(COALESCE(
                        NULLIF(LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))), N''),
                        NULLIF(LTRIM(RTRIM(ISNULL(P.LeadJobName, N''))), N''),
                        N''
                    ))) AS LeadJob,
                    ${sqlProbLeadJobCodeExpr()} AS LeadJobCode,
                    ${SQL_TOPJOB_OWNJOB_DIVISION} AS Division,
                    ${SQL_PROB_WON_VALUE} AS JobValue,
                    P.GrossMargin AS WonGrossProfit,
                    P.Status,
                    P.ProbabilityChance,
                    P.ExpectedDate,
                    LTRIM(RTRIM(ISNULL(P.ToName, ''))) AS LostToWhom,
                    LTRIM(RTRIM(ISNULL(P.ReasonForLoosing, ''))) AS ReasonForLost,
                    LTRIM(RTRIM(ISNULL(P.Remarks, ''))) AS FollowUpRemarks,
                    NULLIF(LTRIM(RTRIM(ISNULL(P.QuoteRef, N''))), N'') AS QuoteRef,
                    wonQ.QuoteDate AS QuoteDate,
                    LTRIM(RTRIM(ISNULL(P.ToName, ISNULL(E.WonCustomerName, E.CustomerName)))) AS CustomerName,
                    E.ClientName,
                    E.ConsultantName,
                    COALESCE(P.BookedDate, P.UpdatedDateTime) AS BookedDate,
                    CAST(NULL AS DATETIME) AS LostDate,
                    NULLIF(LTRIM(RTRIM(ISNULL(wonQ.QuoteType, N''))), N'') AS QuoteType
                FROM LatestProbWonScope P
                INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
                OUTER APPLY (
                    SELECT TOP 1 Q.QuoteDate, Q.QuoteType
                    FROM EnquiryQuotes Q
                    WHERE LTRIM(RTRIM(ISNULL(Q.QuoteNumber, N''))) = LTRIM(RTRIM(ISNULL(P.QuoteRef, N'')))
                    ORDER BY ISNULL(Q.RevisionNo, 0) DESC, Q.ID DESC
                ) wonQ
                WHERE ${wonProbWhere}
                  AND YEAR(COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @year
                  ${safeQuarter ? `AND DATEPART(QUARTER, COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @quarterNums` : ''}
            ) x
            ORDER BY x.JobValue DESC
            `);
            } else if (isLostTopJob || isFollowUpTopJob) {
                const followUpStatusWhere = `(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%follow%')`;
                const statusPreparedByClause = '';
                const statusOwnJobClause = buildSalesReportProbOwnJobClause(request, divisions, companies, allowList);
                topJobBookedRes = await request.query(`
            ${buildSalesReportFunnelLatestProbCte(statusPreparedByClause, statusOwnJobClause, statusTopJobFilterClause, 'LatestProbStatusScope')}
            SELECT
                x.RequestNo,
                x.ProjectName,
                x.LeadJob,
                x.Division,
                x.JobValue,
                x.WonGrossProfit,
                x.Status,
                x.ProbabilityChance,
                x.ExpectedDate,
                x.LostToWhom,
                x.ReasonForLost,
                x.FollowUpRemarks,
                x.QuoteRef,
                x.QuoteDate,
                x.CustomerName,
                x.ClientName,
                x.ConsultantName,
                x.BookedDate,
                x.LostDate,
                x.QuoteType,
                x.LeadJobCode
            FROM (
                SELECT
                    E.RequestNo,
                    E.ProjectName,
                    LTRIM(RTRIM(COALESCE(
                        NULLIF(LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))), N''),
                        NULLIF(LTRIM(RTRIM(ISNULL(P.LeadJobName, N''))), N''),
                        N''
                    ))) AS LeadJob,
                    ${sqlProbLeadJobCodeExpr()} AS LeadJobCode,
                    ${SQL_TOPJOB_OWNJOB_DIVISION} AS Division,
                    ${topJobValueExpr} AS JobValue,
                    P.GrossMargin AS WonGrossProfit,
                    P.Status,
                    P.ProbabilityChance,
                    P.ExpectedDate,
                    LTRIM(RTRIM(ISNULL(P.ToName, ''))) AS LostToWhom,
                    LTRIM(RTRIM(ISNULL(P.ReasonForLoosing, ''))) AS ReasonForLost,
                    LTRIM(RTRIM(ISNULL(P.Remarks, ''))) AS FollowUpRemarks,
                    NULLIF(LTRIM(RTRIM(ISNULL(P.QuoteRef, N''))), N'') AS QuoteRef,
                    wonQ.QuoteDate AS QuoteDate,
                    LTRIM(RTRIM(ISNULL(P.ToName, ISNULL(E.WonCustomerName, E.CustomerName)))) AS CustomerName,
                    E.ClientName,
                    E.ConsultantName,
                    CAST(NULL AS DATETIME) AS BookedDate,
                    COALESCE(P.UpdatedDateTime, P.ExpectedDate) AS LostDate,
                    NULLIF(LTRIM(RTRIM(ISNULL(wonQ.QuoteType, N''))), N'') AS QuoteType
                FROM LatestProbStatusScope P
                INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
                OUTER APPLY (
                    SELECT TOP 1 Q.QuoteDate, Q.QuoteType
                    FROM EnquiryQuotes Q
                    WHERE LTRIM(RTRIM(ISNULL(Q.QuoteNumber, N''))) = LTRIM(RTRIM(ISNULL(P.QuoteRef, N'')))
                    ORDER BY ISNULL(Q.RevisionNo, 0) DESC, Q.ID DESC
                ) wonQ
                WHERE ${isFollowUpTopJob ? followUpStatusWhere : topJobProbWhere}
                  AND YEAR(${probDateExpr}) = @year
                  ${safeQuarter ? `AND DATEPART(QUARTER, ${probDateExpr}) = @quarterNums` : ''}
            ) x
            ORDER BY x.JobValue DESC
            `);
            } else if (isPendingTopJob) {
                topJobBookedRes = await request.query(`
            WITH LatestProbPendingScope AS (
                SELECT * FROM (
                    SELECT
                        P.*,
                        ROW_NUMBER() OVER (
                            PARTITION BY P.RequestNo, LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))), LTRIM(RTRIM(ISNULL(P.LeadJobName, N'')))
                            ORDER BY P.UpdatedDateTime DESC
                        ) AS __rn
                    FROM dbo.Probability P
                    INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
                    WHERE 1 = 1
                      ${buildSalesReportProbOwnJobClause(request, divisions, companies, allowList)}
                      ${topJobScopeClause}
                ) __lp
                WHERE __lp.__rn = 1
            )
            SELECT
                x.RequestNo,
                x.ProjectName,
                x.LeadJob,
                x.Division,
                x.JobValue,
                x.WonGrossProfit,
                x.Status,
                x.ProbabilityChance,
                x.ExpectedDate,
                x.LostToWhom,
                x.ReasonForLost,
                x.FollowUpRemarks,
                x.QuoteRef,
                x.QuoteDate,
                x.CustomerName,
                x.ClientName,
                x.ConsultantName,
                x.BookedDate,
                x.LostDate
            FROM (
                SELECT
                    E.RequestNo,
                    E.ProjectName,
                    LTRIM(RTRIM(COALESCE(
                        NULLIF(LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))), N''),
                        NULLIF(LTRIM(RTRIM(ISNULL(P.LeadJobName, N''))), N''),
                        N''
                    ))) AS LeadJob,
                    ${SQL_TOPJOB_OWNJOB_DIVISION} AS Division,
                    COALESCE(
                        NULLIF(pendingQ.QuoteAmount, 0),
                        ${SQL_PROB_NETQUOTED_PARSED},
                        CAST(0 AS DECIMAL(18,2))
                    ) AS JobValue,
                    P.GrossMargin AS WonGrossProfit,
                    P.Status,
                    P.ProbabilityChance,
                    P.ExpectedDate,
                    LTRIM(RTRIM(ISNULL(P.ToName, ''))) AS LostToWhom,
                    LTRIM(RTRIM(ISNULL(P.ReasonForLoosing, ''))) AS ReasonForLost,
                    LTRIM(RTRIM(ISNULL(P.Remarks, ''))) AS FollowUpRemarks,
                    COALESCE(
                        NULLIF(LTRIM(RTRIM(ISNULL(P.QuoteRef, N''))), N''),
                        NULLIF(LTRIM(RTRIM(ISNULL(pendingQ.QuoteRef, N''))), N'')
                    ) AS QuoteRef,
                    COALESCE(pendingQ.QuoteDate, P.UpdatedDateTime, P.ExpectedDate) AS QuoteDate,
                    LTRIM(RTRIM(ISNULL(P.ToName, ISNULL(E.WonCustomerName, E.CustomerName)))) AS CustomerName,
                    E.ClientName,
                    E.ConsultantName,
                    CAST(NULL AS DATETIME) AS BookedDate,
                    COALESCE(P.UpdatedDateTime, P.ExpectedDate) AS LostDate
                FROM EnquiryMaster E
                LEFT JOIN LatestProbPendingScope P ON E.RequestNo = P.RequestNo
                OUTER APPLY (
                    SELECT TOP 1
                        LTRIM(RTRIM(ISNULL(Q.QuoteNumber, N''))) AS QuoteRef,
                        COALESCE(Q.UpdatedAt, Q.QuoteDate) AS QuoteDate,
                        ISNULL(
                            TRY_CONVERT(
                                DECIMAL(18,2),
                                REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(Q.TotalAmount, '0'))), ',', ''), 'BD', ''), ' ', '')
                            ),
                            0
                        ) AS QuoteAmount
                    FROM EnquiryQuotes Q
                    WHERE Q.RequestNo = E.RequestNo
                      ${buildSalesReportQuoteOwnJobDivisionClause(request, divisions, 'Q', companies, allowList)}
                      AND (
                            P.RequestNo IS NULL
                            OR (
                                LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))) <> N''
                                AND UPPER(LTRIM(RTRIM(ISNULL(Q.OwnJob, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))))
                            )
                            OR (
                                LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))) = N''
                                AND LTRIM(RTRIM(ISNULL(P.QuoteOwnJob, N''))) <> N''
                                AND UPPER(LTRIM(RTRIM(ISNULL(Q.OwnJob, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(P.QuoteOwnJob, N''))))
                            )
                            OR (
                                LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))) = N''
                                AND LTRIM(RTRIM(ISNULL(P.QuoteOwnJob, N''))) = N''
                            )
                          )
                    ORDER BY
                        ISNULL(Q.QuoteNo, 0) DESC,
                        ISNULL(Q.RevisionNo, 0) DESC,
                        ISNULL(Q.UpdatedAt, Q.QuoteDate) DESC,
                        Q.QuoteDate DESC
                ) pendingQ
                WHERE (
                        (P.RequestNo IS NOT NULL AND ${SQL_PROB_ROW_PENDING_FOR_QUOTE_UPDATE})
                        OR (
                            P.RequestNo IS NULL
                            AND EXISTS (
                                SELECT 1
                                FROM EnquiryQuotes EQ
                                WHERE EQ.RequestNo = E.RequestNo
                                  ${pendingQuoteOwnJobClause}
                                  ${pendingTopJobQuoteAccountableClause}
                            )
                        )
                      )
                  AND YEAR(COALESCE(pendingQ.QuoteDate, P.UpdatedDateTime, P.ExpectedDate, ${SQL_LATEST_QUOTE_DATE_PER_ENQUIRY}, E.EnquiryDate)) = @year
                  ${pendingTopJobEnquiryScopeClause}
                  ${safeQuarter ? `AND DATEPART(QUARTER, COALESCE(pendingQ.QuoteDate, P.UpdatedDateTime, P.ExpectedDate, ${SQL_LATEST_QUOTE_DATE_PER_ENQUIRY}, E.EnquiryDate)) = @quarterNums` : ''}
            ) x
            ORDER BY x.JobValue DESC
            `);
            } else {
                const followUpStatusWhere = `(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%follow%')`;
                topJobBookedRes = await request.query(`
            ${SQL_TOPJOB_LATEST_PROB_CTE}
            SELECT
                x.RequestNo,
                x.ProjectName,
                x.LeadJob,
                x.Division,
                x.JobValue,
                x.WonGrossProfit,
                x.Status,
                x.ProbabilityChance,
                x.ExpectedDate,
                x.LostToWhom,
                x.ReasonForLost,
                x.FollowUpRemarks,
                x.CustomerName,
                x.ClientName,
                x.ConsultantName,
                x.BookedDate,
                x.LostDate
            FROM (
                SELECT
                    E.RequestNo,
                    E.ProjectName,
                    LTRIM(RTRIM(COALESCE(
                        NULLIF(LTRIM(RTRIM(ISNULL(P.OwnJobName, N''))), N''),
                        NULLIF(LTRIM(RTRIM(ISNULL(P.LeadJobName, N''))), N''),
                        N''
                    ))) AS LeadJob,
                    ${SQL_TOPJOB_OWNJOB_DIVISION} AS Division,
                    ${topJobValueExpr} AS JobValue,
                    P.GrossMargin AS WonGrossProfit,
                    P.Status,
                    P.ProbabilityChance,
                    P.ExpectedDate,
                    LTRIM(RTRIM(ISNULL(P.ToName, ''))) AS LostToWhom,
                    LTRIM(RTRIM(ISNULL(P.ReasonForLoosing, ''))) AS ReasonForLost,
                    LTRIM(RTRIM(ISNULL(P.Remarks, ''))) AS FollowUpRemarks,
                    LTRIM(RTRIM(ISNULL(P.ToName, ISNULL(E.WonCustomerName, E.CustomerName)))) AS CustomerName,
                    E.ClientName,
                    E.ConsultantName,
                    CAST(NULL AS DATETIME) AS BookedDate,
                    COALESCE(P.UpdatedDateTime, P.ExpectedDate) AS LostDate
                FROM EnquiryMaster E
                LEFT JOIN LatestProb P ON E.RequestNo = P.RequestNo
                WHERE ${isFollowUpTopJob ? followUpStatusWhere : topJobProbWhere}
                  AND YEAR(${topJobDateExpr}) = @year ${topJobScopeClause}
                  ${safeQuarter ? `AND DATEPART(QUARTER, ${topJobDateExpr}) = @quarterNums` : ''}
            ) x
            ORDER BY x.JobValue DESC
            `);
            }
        } catch (e) {
            console.warn('[Sales Report] top-job-booked Probability fallback:', e.message);
            const topJobStatusWhereLegacy = getTopJobBookedStatusWhere(req.query.topJobStatus);
            topJobBookedRes = await request.query(`
            SELECT
                x.RequestNo,
                x.ProjectName,
                x.JobValue,
                x.Division,
                x.WonGrossProfit,
                x.Status,
                x.ProbabilityChance,
                x.ExpectedDate,
                x.LostToWhom,
                x.ReasonForLost,
                x.FollowUpRemarks,
                x.CustomerName,
                x.ClientName,
                x.ConsultantName,
                x.BookedDate,
                x.LostDate
            FROM (
                SELECT
                    E.RequestNo,
                    E.ProjectName,
                    CAST(N'' AS NVARCHAR(200)) AS Division,
                    ${itemValueCol} AS JobValue,
                    E.WonGrossProfit AS WonGrossProfit,
                    E.Status,
                    CAST(NULL AS NVARCHAR(120)) AS ProbabilityChance,
                    CAST(NULL AS DATETIME) AS ExpectedDate,
                    CAST(NULL AS NVARCHAR(255)) AS LostToWhom,
                    CAST(NULL AS NVARCHAR(1000)) AS ReasonForLost,
                    CAST(NULL AS NVARCHAR(MAX)) AS FollowUpRemarks,
                    LTRIM(RTRIM(ISNULL(E.WonCustomerName, E.CustomerName))) AS CustomerName,
                    E.ClientName,
                    E.ConsultantName,
                    CAST(NULL AS DATETIME) AS BookedDate,
                    CAST(NULL AS DATETIME) AS LostDate
                FROM EnquiryMaster E
                ${itemValueApply}
                WHERE ${topJobStatusWhereLegacy}
                  AND YEAR(E.ExpectedOrderDate) = @year ${filterClause}
                  ${safeQuarter ? 'AND DATEPART(QUARTER, E.ExpectedOrderDate) = @quarterNums' : ''}
            ) x
            ORDER BY x.JobValue DESC
            `);
        }

        const topJobRows = topJobBookedRes.recordset || [];
        const reqNos = [...new Set(topJobRows.map((r) => String(r.RequestNo || '').trim()).filter(Boolean))];
        let concernSeAccountableMap = new Map();
        let concernSeByRequestMap = new Map();
        if (reqNos.length > 0) {
            const seReq = new sql.Request();
            const inParams = reqNos.map((rn, i) => {
                const key = `rq${i}`;
                seReq.input(key, sql.NVarChar, rn);
                return `@${key}`;
            });
            if (hasReportFilterList(divisions)) {
                bindReportFilterList(seReq, 'srSeDiv', divisions);
            }
            const seDivClause = hasReportFilterList(divisions)
                ? `AND ${sqlCseOwnJobDivisionMatchList('cse', divisions, 'srSeDiv')}`
                : '';
            const seRowsRes = await seReq.query(`
                SELECT
                    cse.RequestNo,
                    LTRIM(RTRIM(ISNULL(cse.SEName, ''))) AS SEName,
                    ${sqlCseLeadJobCode('cse')} AS LeadJobCode,
                    LTRIM(RTRIM(ISNULL(cse.ownjob, ISNULL(cse.OwnJob, N'')))) AS OwnJob
                FROM ConcernedSE cse
                WHERE cse.RequestNo IN (${inParams.join(', ')})
                  ${seDivClause}
            `);
            (seRowsRes.recordset || []).forEach((row) => {
                const k = String(row.RequestNo || '').trim();
                if (!k) return;
                const nm = String(row.SEName || '').trim();
                if (nm) {
                    if (!concernSeByRequestMap.has(k)) concernSeByRequestMap.set(k, new Set());
                    concernSeByRequestMap.get(k).add(nm);
                }
            });
            const accountableRowsRes = await seReq.query(`
                SELECT
                    cse.RequestNo,
                    LTRIM(RTRIM(ISNULL(cse.SEName, ''))) AS SEName,
                    ${sqlCseLeadJobCode('cse')} AS LeadJobCode,
                    LTRIM(RTRIM(ISNULL(cse.ownjob, ISNULL(cse.OwnJob, N'')))) AS OwnJob
                FROM ConcernedSE cse
                WHERE cse.RequestNo IN (${inParams.join(', ')})
                  AND ${sqlCseAccountabilityYes('cse')}
                  ${seDivClause}
            `);
            concernSeAccountableMap = (accountableRowsRes.recordset || []).reduce((acc, row) => {
                const rn = String(row.RequestNo || '').trim();
                const ljc = String(row.LeadJobCode || '').trim().toUpperCase();
                const ownJob = String(row.OwnJob || '').trim().toUpperCase();
                const nm = String(row.SEName || '').trim();
                if (!rn || !nm) return acc;
                if (ownJob) acc.set(`${rn}|OWN|${ownJob}`, nm);
                if (ljc) acc.set(`${rn}|LJC|${ljc}`, nm);
                return acc;
            }, new Map());
        }

        const resolveTopJobConcernSe = (r) => {
            const rn = String(r.RequestNo || '').trim();
            const leadJob = String(r.LeadJob || '').trim().toUpperCase();
            const ljc = String(r.LeadJobCode || '').trim().toUpperCase();
            if (leadJob && concernSeAccountableMap.has(`${rn}|OWN|${leadJob}`)) {
                return concernSeAccountableMap.get(`${rn}|OWN|${leadJob}`);
            }
            if (ljc && concernSeAccountableMap.has(`${rn}|LJC|${ljc}`)) {
                return concernSeAccountableMap.get(`${rn}|LJC|${ljc}`);
            }
            if (concernSeByRequestMap.has(rn)) {
                return Array.from(concernSeByRequestMap.get(rn)).join(', ');
            }
            return '—';
        };

        res.json({
            topJobBooked: topJobRows.map((r) => ({
                RequestNo: r.RequestNo,
                ProjectName: r.ProjectName,
                LeadJob: r.LeadJob,
                Division: r.Division,
                JobValue: r.JobValue,
                WonGrossProfit: r.WonGrossProfit,
                GrossMargin: r.GrossMargin != null ? r.GrossMargin : r.WonGrossProfit,
                Status: r.Status,
                ProbabilityChance: r.ProbabilityChance,
                ExpectedDate: r.ExpectedDate,
                LostToWhom: r.LostToWhom,
                ReasonForLost: r.ReasonForLost,
                FollowUpRemarks: r.FollowUpRemarks,
                QuoteRef: r.QuoteRef,
                QuoteDate: r.QuoteDate,
                QuoteType: r.QuoteType || '',
                CustomerName: r.CustomerName,
                ClientName: r.ClientName,
                ConsultantName: r.ConsultantName,
                BookedDate: r.BookedDate,
                LostDate: r.LostDate,
                ConcernSEEEQS: resolveTopJobConcernSe(r)
            }))
        });
    } catch (err) {
        console.error('Error fetching top job booked:', err);
        res.status(500).json({ error: 'Failed to fetch top jobs' });
    }
});


router.get('/item-wise-stats', async (req, res) => {
    try {
        await applySalesReportEmailScope(req);
        const { year, quarter } = req.query;
        if (!year) return res.status(400).json({ error: 'Year is required' });

        const { companies, divisions, roles } = resolveSalesReportFilterLists(req);
        const request = new sql.Request();

        const safeYear = parseInt(year);
        const safeQuarter = (quarter && quarter !== 'All') ? String(quarter).trim() : null;
        let quarterNums = null;
        if (safeQuarter) quarterNums = parseInt(safeQuarter.replace('Q', ''));

        request.input('year', sql.Int, safeYear);
        if (safeQuarter) {
            request.input('quarterNums', sql.Int, quarterNums);
            request.input('quarterStrs', sql.NVarChar, safeQuarter);
        }

        const allowList = resolveSalesReportDivisionAllowList(req, divisions);
        const filterClause = appendSalesReportEnquiryFilters(req, request, companies, divisions, roles);

        const effectiveSeForItemWiseList = getSalesReportAssignedSeList(req, roles);

        let itemWiseGroupBy = 'mef.DepartmentName';
        let itemWiseSelect = 'mef.DepartmentName as ItemName';
        let itemWiseWhere = '';

        if (hasReportFilterList(effectiveSeForItemWiseList)) {
            itemWiseGroupBy = 'mef.ItemName';
            itemWiseSelect = 'mef.ItemName as ItemName';
        }

        if (hasReportFilterList(companies)) {
            const coCount = bindReportFilterList(request, 'srIwCo', companies);
            itemWiseWhere += ` AND ${sqlOrTrimMatch('mef.CompanyName', 'srIwCo', coCount)} `;
        }
        if (hasReportFilterList(divisions)) {
            const divCount = bindReportFilterList(request, 'srIwDiv', divisions);
            itemWiseWhere += ` AND ${sqlOrTrimMatch('mef.DepartmentName', 'srIwDiv', divCount)} `;
        } else if (allowList && allowList.length) {
            itemWiseWhere += sqlMatchAllowedDivisions('mef.DepartmentName', allowList);
        }

        const localSelectedCustomerApply = `
            OUTER APPLY (
                SELECT TOP 1 ToName
                FROM EnquiryQuotes
                WHERE RequestNo = E.RequestNo
                ORDER BY
                    CASE WHEN QuoteNumber = E.WonQuoteRef THEN 0 ELSE 1 END,
                    UpdatedAt DESC
            ) SC
        `;

        const itemWiseRes = await request.query(`
            SELECT
                ${itemWiseSelect},
                SUM(CASE WHEN E.Status = 'Won' THEN ISNULL(EPV.Price, 0) ELSE 0 END) as WonValue,
                SUM(CASE WHEN E.Status = 'Lost' THEN ISNULL(EPV.Price, 0) ELSE 0 END) as LostValue,
                SUM(CASE WHEN E.Status IN ('Follow-up', 'FollowUp') THEN ISNULL(EPV.Price, 0) ELSE 0 END) as FollowUpValue
            FROM EnquiryMaster E
            ${localSelectedCustomerApply}
            JOIN EnquiryFor EF ON E.RequestNo = EF.RequestNo
            JOIN Master_EnquiryFor mef ON (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '%- ' + mef.ItemName OR EF.ItemName LIKE '%-' + mef.ItemName)
            OUTER APPLY (
                 SELECT SUM(ISNULL(Price, 0)) as Price
                 FROM EnquiryPricingValues EPV
                 WHERE EPV.RequestNo = EF.RequestNo 
                   AND (EPV.EnquiryForID = EF.ID OR EPV.EnquiryForItem = EF.ItemName)
                   AND (EPV.CustomerName = SC.ToName OR SC.ToName IS NULL)
            ) EPV
            WHERE YEAR(COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @year ${filterClause} ${itemWiseWhere}
            ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @quarterNums' : ''}
            GROUP BY ${itemWiseGroupBy}
        `);

        // Targets
        const requestTarget = new sql.Request();
        requestTarget.input('year', sql.Int, safeYear);
        if (safeQuarter) {
            requestTarget.input('quarterStr', sql.NVarChar, safeQuarter);
        }
        bindSalesReportAllowedDivisions(requestTarget, allowList);

        let targetQuery = '';
        const companyTargetExists = hasReportFilterList(companies)
            ? ` AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefT
                    WHERE ${sqlOrTrimMatch('mefT.CompanyName', 'srIwTgtCo', bindReportFilterList(requestTarget, 'srIwTgtCo', companies))}
                      AND (
                        LTRIM(RTRIM(ISNULL(mefT.DepartmentName, ''))) = LTRIM(RTRIM(ISNULL(SalesTargets.Division, '')))
                        OR LTRIM(RTRIM(ISNULL(mefT.ItemName, ''))) = LTRIM(RTRIM(ISNULL(SalesTargets.Division, '')))
                      )
                ) `
            : '';
        if (req.salesReportNonCcBlock === true) {
            targetQuery = `
                SELECT Division as Name, CAST(0 AS DECIMAL(18,2)) as Target
                FROM SalesTargets WHERE 1=0
            `;
        } else if (hasReportFilterList(effectiveSeForItemWiseList)) {
            bindReportFilterList(requestTarget, 'srIwTgtSe', effectiveSeForItemWiseList);
            targetQuery = `
                SELECT ItemName as Name, SUM(ISNULL(TargetValue, 0)) as Target
                FROM SalesTargets
                WHERE FinancialYear = @year ${buildSalesTargetsSeClause(effectiveSeForItemWiseList, 'srIwTgtSe')}
                ${companyTargetExists}
                ${safeQuarter ? 'AND Quarter = @quarterStr ' : ''}
                GROUP BY ItemName
            `;
        } else {
            let targetDivAllow = '';
            if (hasReportFilterList(divisions)) {
                bindReportFilterList(requestTarget, 'srIwTgtDiv', divisions);
                targetDivAllow = buildSalesTargetsDivisionClause(divisions, 'srIwTgtDiv');
            } else if (allowList && allowList.length) {
                targetDivAllow = sqlMatchAllowedDivisions('SalesTargets.Division', allowList);
            }
            targetQuery = `
                SELECT Division as Name, SUM(ISNULL(TargetValue, 0)) as Target
                FROM SalesTargets
                WHERE FinancialYear = @year
                ${companyTargetExists}
                ${targetDivAllow}
                ${safeQuarter ? 'AND Quarter = @quarterStr ' : ''}
                GROUP BY Division
            `;
        }

        const targetByDivRes = await requestTarget.query(targetQuery);

        // Merge
        const itemWiseMap = {};
        itemWiseRes.recordset.forEach(r => {
            const name = r.ItemName || 'Unknown';
            if (!itemWiseMap[name]) itemWiseMap[name] = { name, won: 0, lost: 0, followUp: 0, target: 0 };
            itemWiseMap[name].won = r.WonValue;
            itemWiseMap[name].lost = r.LostValue;
            itemWiseMap[name].followUp = r.FollowUpValue;
        });

        targetByDivRes.recordset.forEach(r => {
            const name = r.Name || 'Unknown';
            if (!itemWiseMap[name]) itemWiseMap[name] = { name, won: 0, lost: 0, followUp: 0, target: 0 };
            itemWiseMap[name].target += r.Target;
        });

        const itemWiseStats = Object.values(itemWiseMap).filter(i => i.name !== 'Unknown');
        res.json(itemWiseStats);

    } catch (err) {
        console.error('Error fetching item wise stats:', err);
        res.json([]);
    }
});


router.get('/funnel-details', async (req, res) => {
    try {
        await applySalesReportEmailScope(req);
        const { probabilityName } = req.query;
        if (!req.query.year || !probabilityName) {
            return res.status(400).json({ error: 'Year and Probability Name are required' });
        }

        const ctx = buildSalesReportItemValueContext(req);
        if (!ctx) return res.status(400).json({ error: 'Year is required' });

        const {
            request,
            filterClause,
            itemValueApply,
            itemValueCol,
            divisions,
            allowList,
            safeQuarter,
            quarterNum,
        } = ctx;
        request.input('probName', sql.NVarChar, probabilityName);
        if (safeQuarter) {
            bindInputIfMissing(request, 'quarterNum', sql.Int, quarterNum);
        }

        // 1. Fetch Enquiries
        const enquiriesRes = await request.query(`
            SELECT
                E.RequestNo,
                E.ProjectName,
                E.CustomerName,
                ${itemValueCol} as TotalPrice,
                Q.QuoteRef,
                Q.QuoteDate
            FROM EnquiryMaster E
            ${itemValueApply}
            OUTER APPLY (
                SELECT TOP 1 QuoteNumber as QuoteRef, QuoteDate
                FROM EnquiryQuotes QM
                WHERE QM.RequestNo = E.RequestNo
                ORDER BY
                    CASE WHEN QM.QuoteNumber = E.WonQuoteRef THEN 0 ELSE 1 END ASC,
                    UpdatedAt DESC
            ) Q
            WHERE YEAR(COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @year
              ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @quarterNum' : ''}
              AND E.ProbabilityOption LIKE @probName + '%'
              AND E.Status NOT IN ('Won', 'Lost')
              ${filterClause}
            ORDER BY E.RequestNo DESC
        `);

        const enquiries = enquiriesRes.recordset;

        if (enquiries.length === 0) return res.json([]);

        // 2. Fetch Job/Item Hierarchy for these enquiries
        const requestNos = enquiries.map(e => `'${e.RequestNo}'`).join(',');

        const jobsRequest = new sql.Request();
        let jobWhere = `WHERE EF.RequestNo IN (${requestNos})`;
        jobWhere += buildSalesReportJobHierarchyDivisionWhere(jobsRequest, divisions, allowList);

        const jobsRes = await jobsRequest.query(`
            SELECT 
                EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName,
                ISNULL(EPV.Price, 0) as NetPrice
            FROM EnquiryFor EF
            CROSS APPLY (
                SELECT TOP 1 ToName 
                FROM EnquiryQuotes EQ
                JOIN EnquiryMaster E_Inner ON EQ.RequestNo = E_Inner.RequestNo
                WHERE EQ.RequestNo = EF.RequestNo
                ORDER BY 
                    CASE WHEN EQ.QuoteNumber = E_Inner.WonQuoteRef THEN 0 ELSE 1 END, 
                    EQ.UpdatedAt DESC
            ) SC
            OUTER APPLY (
                SELECT SUM(ISNULL(Price, 0)) as Price
                FROM EnquiryPricingValues EPV
                WHERE EPV.RequestNo = EF.RequestNo 
                  AND (EPV.EnquiryForID = EF.ID OR EPV.EnquiryForItem = EF.ItemName)
                  AND (EPV.CustomerName = SC.ToName OR SC.ToName IS NULL)
            ) EPV
            ${jobWhere}
        `);

        const allJobs = jobsRes.recordset;
        const divisionScoped = hasSalesReportJobDivisionScope(divisions, allowList);

        // 3. Structure Data
        const result = enquiries.map(e => {
            const myJobs = allJobs.filter(j => j.RequestNo == e.RequestNo);

            // Build simple tree structure
            const jobMap = {};
            const roots = [];

            // Pass 1: Node Map
            myJobs.forEach(j => {
                jobMap[j.ID] = { ...j, children: [] };
            });

            // Pass 2: Tree Assembly
            myJobs.forEach(j => {
                if (j.ParentID && jobMap[j.ParentID]) {
                    jobMap[j.ParentID].children.push(jobMap[j.ID]);
                } else {
                    roots.push(jobMap[j.ID]);
                }
            });

            // Calculate Total Price for Display based on Status
            let totalPrice = 0;
            const s = e.Status ? e.Status.toLowerCase() : '';
            if (s === 'won') totalPrice = e.WonValue;
            else if (s === 'lost') totalPrice = e.LostValue;
            else totalPrice = e.TotalPrice; // For funnel-details, query returns TotalPrice alias

            // Recalculate when division scope is active (single or multiple divisions)
            if (divisionScoped) {
                totalPrice = myJobs.reduce((acc, curr) => acc + (curr.NetPrice || 0), 0);
            }

            return {
                ...e,
                TotalPrice: totalPrice,
                jobs: roots // Tree of jobs
            };
        });

        // Sort by TotalPrice (Larger to Smaller)
        result.sort((a, b) => b.TotalPrice - a.TotalPrice);

        res.json(result);

    } catch (err) {
        console.error('Error fetching funnel details:', err);
        res.status(500).json({ error: 'Failed to fetch details' });
    }
});


router.get('/drilldown-details', async (req, res) => {
    try {
        await applySalesReportEmailScope(req);
        const { year, company, division, role, metric, label, status, quarter } = req.query;
        if (!year || !metric) return res.status(400).json({ error: 'Year and Metric are required' });

        const safeLabel = label ? String(label).trim() : null;

        // Sanitize inputs
        const safeYear = year ? parseInt(year) : null;
        const { companies, divisions, roles } = resolveSalesReportFilterLists(req);
        const allowList = resolveSalesReportDivisionAllowList(req, divisions);

        const request = new sql.Request();
        request.input('year', sql.Int, safeYear);
        if (safeLabel) request.input('label', sql.NVarChar, safeLabel);
        if (status) request.input('status', sql.NVarChar, status);
        bindSalesReportCompanyDivision(request, companies, divisions);

        const safeQuarter = (quarter && quarter !== 'All') ? String(quarter).trim() : null;
        let quarterNum = null;
        if (safeQuarter) {
            quarterNum = parseInt(safeQuarter.replace('Q', ''));
            request.input('quarterNum', sql.Int, quarterNum);
        }

        const filterClause = appendSalesReportEnquiryFilters(req, request, companies, divisions, roles);

        let baseQuery = `
            SELECT 
                E.RequestNo, 
                E.ProjectName, 
                E.CustomerName, 
                E.Status,
                ISNULL(TRY_CAST(REPLACE(REPLACE(E.CustomerPreferredPrice, 'BD', ''), ',', '') AS DECIMAL(18,2)), 0) as PreferredPrice,
                ISNULL(TRY_CAST(REPLACE(REPLACE(E.WonOrderValue, 'BD', ''), ',', '') AS DECIMAL(18,2)), 0) as WonValue,
                ISNULL(TRY_CAST(REPLACE(REPLACE(E.LostCompetitorPrice, 'BD', ''), ',', '') AS DECIMAL(18,2)), 0) as LostValue,
                Q.QuoteRef,
                Q.QuoteDate
            FROM EnquiryMaster E
            OUTER APPLY (
                SELECT TOP 1 QuoteNumber as QuoteRef, QuoteDate 
                FROM EnquiryQuotes QM 
                WHERE QM.RequestNo = E.RequestNo
                ORDER BY 
                    CASE WHEN QM.QuoteNumber = E.WonQuoteRef THEN 0 ELSE 1 END ASC,
                    UpdatedAt DESC
            ) Q
            WHERE 1=1 
        `;

        // Metric Logic
        if (metric === 'quarterly-actual') {
            // Label is 'Q1', 'Q2' etc. Filter by Quarter of ExpectedOrderDate and Status=Won
            baseQuery += ` 
                AND E.Status = 'Won' 
                AND YEAR(E.ExpectedOrderDate) = @year 
                AND 'Q' + CAST(DATEPART(QUARTER, E.ExpectedOrderDate) AS VARCHAR) = @label 
                ${filterClause}
            `;
        } else if (metric === 'win-loss') {
            // Label is 'Won', 'Lost', 'Follow Up'
            // Map label to Status
            // 'Won' -> Status 'Won', Year(ExpectedDate) = @year
            baseQuery += ` AND YEAR(COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @year ${filterClause} ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @quarterNum' : ''} `;
            if (label === 'Won') baseQuery += ` AND E.Status = 'Won' `;
            else if (label === 'Lost') baseQuery += ` AND E.Status = 'Lost' `;
            else if (label === 'Follow Up') baseQuery += ` AND E.Status IN ('Follow-up', 'FollowUp') `;
        } else if (metric === 'customer') {
            // Label is Customer Name
            baseQuery += ` 
                AND E.Status = 'Won' 
                AND YEAR(E.ExpectedOrderDate) = @year 
                AND E.WonCustomerName = @label
                ${safeQuarter ? 'AND DATEPART(QUARTER, E.ExpectedOrderDate) = @quarterNum' : ''}
                ${filterClause}
            `;
        } else if (metric === 'project') {
            baseQuery += ` 
                AND E.Status = 'Won' 
                AND YEAR(E.ExpectedOrderDate) = @year 
                AND E.ProjectName = @label
                ${safeQuarter ? 'AND DATEPART(QUARTER, E.ExpectedOrderDate) = @quarterNum' : ''}
                ${filterClause}
            `;
        } else if (metric === 'client') {
            baseQuery += ` 
               AND E.Status = 'Won' 
               AND YEAR(E.ExpectedOrderDate) = @year 
               AND E.ClientName = @label
               ${safeQuarter ? 'AND DATEPART(QUARTER, E.ExpectedOrderDate) = @quarterNum' : ''}
               ${filterClause}
           `;
        } else if (metric === 'item-stats') {
            // Label is ItemName. Status param determines drilldown (Won, Lost, FollowUp, Quoted)
            // Need to join Master_EnquiryFor logic again to filter by ItemName provided in label

            // Check if label is Division or Item based on Role
            let itemFilter = '';
            if (hasReportFilterList(roles)) itemFilter = `(mef.ItemName = @label)`;
            else itemFilter = `(mef.DepartmentName = @label)`;

            baseQuery += `
                AND YEAR(COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @year ${filterClause}
                ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @quarterNum' : ''}
                AND EXISTS (
                    SELECT 1 FROM EnquiryFor EF
                    JOIN Master_EnquiryFor mef ON (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '%- ' + mef.ItemName OR EF.ItemName LIKE '%-' + mef.ItemName)
                    WHERE EF.RequestNo = E.RequestNo 
                    AND ${itemFilter}
                )
             `;

            if (status === 'Won') baseQuery += ` AND E.Status = 'Won' `;
            else if (status === 'Lost') baseQuery += ` AND E.Status = 'Lost' `;
            else if (status === 'Follow Up') baseQuery += ` AND E.Status IN ('Follow-up', 'FollowUp') `;
            else if (status === 'Quoted') baseQuery += ` AND E.Status IN ('Won', 'Lost', 'Follow-up', 'FollowUp') `; // Approximate for Quoted
        }

        baseQuery += ` ORDER BY E.RequestNo DESC`;

        const enquiriesRes = await request.query(baseQuery);
        const enquiries = enquiriesRes.recordset;

        if (enquiries.length === 0) return res.json([]);

        // Fetch Job Hierarchy (Copying Logic from funnel-details)
        const requestNos = enquiries.map(e => `'${e.RequestNo}'`).join(',');

        // Use a chunked query if too many request nos, but for top 10/quarterly it fits.
        // Use a chunked query if too many request nos, but for top 10/quarterly it fits.
        const jobsRequest = new sql.Request();
        let jobWhere = `WHERE EF.RequestNo IN (${requestNos})`;
        jobWhere += buildSalesReportJobHierarchyDivisionWhere(jobsRequest, divisions, allowList);

        const jobsRes = await jobsRequest.query(`
            SELECT 
                EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName,
                ISNULL(EPV.Price, 0) as NetPrice
            FROM EnquiryFor EF
            CROSS APPLY (
                SELECT TOP 1 ToName 
                FROM EnquiryQuotes EQ
                JOIN EnquiryMaster E_Inner ON EQ.RequestNo = E_Inner.RequestNo
                WHERE EQ.RequestNo = EF.RequestNo
                ORDER BY 
                    CASE WHEN EQ.QuoteNumber = E_Inner.WonQuoteRef THEN 0 ELSE 1 END, 
                    EQ.UpdatedAt DESC
            ) SC
            OUTER APPLY (
                SELECT SUM(ISNULL(Price, 0)) as Price
                FROM EnquiryPricingValues EPV
                WHERE EPV.RequestNo = EF.RequestNo 
                  AND (EPV.EnquiryForID = EF.ID OR EPV.EnquiryForItem = EF.ItemName)
                  AND (EPV.CustomerName = SC.ToName OR SC.ToName IS NULL)
            ) EPV
            ${jobWhere}
        `);

        const allJobs = jobsRes.recordset;
        const result = enquiries.map(e => {
            const myJobs = allJobs.filter(j => j.RequestNo == e.RequestNo);
            const jobMap = {};
            const roots = [];
            myJobs.forEach(j => { jobMap[j.ID] = { ...j, children: [] }; });
            myJobs.forEach(j => {
                if (j.ParentID && jobMap[j.ParentID]) jobMap[j.ParentID].children.push(jobMap[j.ID]);
                else roots.push(jobMap[j.ID]);
            });

            // Calculate Total Price for Display based on Status
            // FORCE RECALCULATION: Always derive total from the sum of item components 
            // to avoid mismatch with stale 'WonOrderValue' from EnquiryMaster.
            const s = e.Status ? e.Status.trim().toLowerCase() : '';

            // Sum up NetPrice of visible jobs to get Total
            // Logic: Sum only ROOTs of the filtered list to avoid double counting hierarchy.
            const visibleIds = new Set(myJobs.map(j => j.ID));
            const calculatedTotal = myJobs.reduce((acc, curr) => {
                // If this item has a parent that is also in the list, skip it (it's a child)
                if (curr.ParentID && visibleIds.has(curr.ParentID)) {
                    return acc;
                }
                return acc + (curr.NetPrice || 0);
            }, 0);

            // Use calculated total if available and > 0, otherwise fallback (rare case)
            // But strict adherence to breakdown is preferred.
            let totalPrice = calculatedTotal;

            return {
                ...e,
                TotalPrice: totalPrice,
                jobs: roots
            };
        });

        // 3. Sort by Total Price (Larger to Smaller)
        result.sort((a, b) => b.TotalPrice - a.TotalPrice);

        res.json(result);

    } catch (err) {
        console.error('Error in drilldown-details:', err);
        res.status(500).json({ error: 'Failed to fetch drilldown details' });
    }
});

/** Enquiry-wise quoted values: latest quote vs highest quote (for audit/debug). */
router.get('/quoted-enquiry-values', async (req, res) => {
    try {
        await applySalesReportEmailScope(req);
        const ctx = buildSalesReportItemValueContext(req);
        if (!ctx) return res.status(400).json({ error: 'Year is required' });

        const { request, safeQuarter, companies, divisions, roles, allowList, nonCcBlock } = ctx;
        const effectiveQuotedSeList = getSalesReportAssignedSeList(req, roles);
        bindSalesReportAllowedDivisions(request, allowList);
        let quotedFilterClause = '';
        if (nonCcBlock) {
            quotedFilterClause += ' AND 1=0 ';
        } else {
            quotedFilterClause += sqlEnquiryForCompanyDivisionExists(request, companies, divisions, allowList);
            quotedFilterClause += buildConcernedSeNameExistsClause(request, effectiveQuotedSeList, 'srSeQev');
        }

        const rowsRes = await request.query(`
            WITH QuoteBase AS (
                SELECT
                    EQ.RequestNo,
                    ISNULL(EQ.QuoteNo, 0) AS QuoteNo,
                    EQ.QuoteNumber,
                    COALESCE(EQ.UpdatedAt, EQ.QuoteDate) AS QuoteDate,
                    ISNULL(
                        TRY_CONVERT(
                            DECIMAL(18,2),
                            REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EQ.TotalAmount, '0'))), ',', ''), 'BD', ''), ' ', '')
                        ),
                        0
                    ) AS Amount
                FROM EnquiryQuotes EQ
            ),
            LatestQuote AS (
                SELECT *
                FROM (
                    SELECT
                        QB.*,
                        ROW_NUMBER() OVER (
                            PARTITION BY QB.RequestNo
                            ORDER BY
                                QB.QuoteNo DESC,
                                QB.QuoteDate DESC,
                                QB.QuoteNumber DESC
                        ) AS __rn
                    FROM QuoteBase QB
                ) x
                WHERE x.__rn = 1
            ),
            HighestQuote AS (
                SELECT *
                FROM (
                    SELECT
                        QB.*,
                        ROW_NUMBER() OVER (
                            PARTITION BY QB.RequestNo
                            ORDER BY
                                QB.Amount DESC,
                                QB.QuoteNo DESC,
                                QB.QuoteDate DESC
                        ) AS __rn
                    FROM QuoteBase QB
                ) x
                WHERE x.__rn = 1
            )
            SELECT
                E.RequestNo,
                E.ProjectName,
                L.QuoteNo AS LatestQuoteNo,
                L.QuoteNumber AS LatestQuoteNumber,
                L.QuoteDate AS LatestQuoteDate,
                L.Amount AS LatestQuoteAmount,
                H.QuoteNo AS HighestQuoteNo,
                H.QuoteNumber AS HighestQuoteNumber,
                H.QuoteDate AS HighestQuoteDate,
                H.Amount AS HighestQuoteAmount
            FROM EnquiryMaster E
            INNER JOIN LatestQuote L ON L.RequestNo = E.RequestNo
            INNER JOIN HighestQuote H ON H.RequestNo = E.RequestNo
            WHERE YEAR(COALESCE(L.QuoteDate, E.ExpectedOrderDate, E.EnquiryDate)) = @year ${quotedFilterClause}
              ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(L.QuoteDate, E.ExpectedOrderDate, E.EnquiryDate)) = @quarterNums' : ''}
            ORDER BY E.RequestNo DESC
        `);

        const rows = (rowsRes.recordset || []).map((r) => ({
            RequestNo: r.RequestNo,
            ProjectName: r.ProjectName,
            LatestQuoteNo: r.LatestQuoteNo,
            LatestQuoteNumber: r.LatestQuoteNumber,
            LatestQuoteDate: r.LatestQuoteDate,
            LatestQuoteAmount: Number(r.LatestQuoteAmount) || 0,
            HighestQuoteNo: r.HighestQuoteNo,
            HighestQuoteNumber: r.HighestQuoteNumber,
            HighestQuoteDate: r.HighestQuoteDate,
            HighestQuoteAmount: Number(r.HighestQuoteAmount) || 0
        }));

        const totals = rows.reduce((acc, r) => {
            acc.latestTotal += r.LatestQuoteAmount || 0;
            acc.highestTotal += r.HighestQuoteAmount || 0;
            return acc;
        }, { latestTotal: 0, highestTotal: 0 });

        res.json({
            count: rows.length,
            totals,
            rows
        });
    } catch (err) {
        console.error('Error fetching quoted enquiry values:', err);
        res.status(500).json({ error: 'Failed to fetch quoted enquiry values' });
    }
});

module.exports = router;


