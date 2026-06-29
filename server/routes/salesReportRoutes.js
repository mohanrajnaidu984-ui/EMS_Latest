
const express = require('express');
const router = express.Router();
const { sql } = require('../dbConfig');
const {
    resolvePricingAccessContext,
    normalizePricingEmail,
    userHasUnlockedReportFilters,
    userIsCcMailReportScoped,
} = require('../lib/quotePricingAccess');

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
    let qCompany = normalizeReportFilterValue(req.query.company);
    if (allowedCompanies.length > 0 && (!qCompany || !allowedCompanies.includes(qCompany))) {
        req.query.company = allowedCompanies[0];
        qCompany = allowedCompanies[0];
    }
    const divisionSource = qCompany ? pairs.filter((p) => p.company === qCompany) : pairs;
    const allowedDivisions = [...new Set(divisionSource.map((p) => p.division).filter(Boolean))];
    const qDivision = normalizeReportFilterValue(req.query.division);
    if (allowedDivisions.length > 0 && (!qDivision || !allowedDivisions.includes(qDivision))) {
        req.query.division = allowedDivisions[0];
    }
}

/** Non–CC-mail users: force filters to their company / division / SE so APIs cannot be scoped wider via query string. */
async function applySalesReportEmailScope(req) {
    delete req.salesReportForceSeName;
    delete req.salesReportNonCcBlock;
    delete req.salesReportNonCcScope;
    delete req.salesReportCcScope;
    delete req.salesReportUserEmail;

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

    const dept = String(user.Department || '').trim();
    let company = '';
    if (dept) {
        const cReq = new sql.Request();
        cReq.input('dept', sql.NVarChar, dept);
        const cRes = await cReq.query(`
            SELECT TOP 1 CompanyName FROM Master_EnquiryFor WHERE DepartmentName = @dept
        `);
        company = String(cRes.recordset?.[0]?.CompanyName || '').trim();
    }
    if (company) req.query.company = company;
    if (dept) req.query.division = dept;
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
 * When Probability row P is in scope: achievement counts only if selected SE is the sole
 * accountable assignee for that enquiry + lead job (L-code). Duplicate accountability rows
 * in legacy data resolve to one canonical name (stable ORDER BY).
 */
function buildSalesReportProbAccountableSeClause(effectiveSe, seInputName = 'quotedSe') {
    if (!effectiveSe) return '';
    const leadJobCodeExpr = sqlProbLeadJobCodeExpr();
    const canonicalAccountableSe = `
(
    SELECT TOP 1 LTRIM(RTRIM(ISNULL(c0.SEName, N'')))
    FROM ConcernedSE c0
    WHERE c0.RequestNo = E.RequestNo
      AND ${sqlCseAccountabilityYes('c0')}
      AND ${sqlCseLeadJobCode('c0')} = ${leadJobCodeExpr}
      AND ${sqlCseLeadJobCode('c0')} <> N''
    ORDER BY c0.SEName
)`;
    return `
      AND LTRIM(RTRIM(ISNULL(@${seInputName}, N''))) = ${canonicalAccountableSe}
      AND LTRIM(RTRIM(ISNULL(${canonicalAccountableSe}, N''))) <> N''`;
}

function buildSalesReportEnquiryScopeClause({ nonCcBlock, safeCompany, safeDivision, effectiveSe, seInputName = 'quotedSe', accountableSeOnly = false }) {
    let clause = '';
    if (nonCcBlock) {
        clause += ' AND 1=0 ';
    } else {
        if (safeCompany && safeCompany !== 'All') {
            clause += ` AND EXISTS (
                    SELECT 1
                    FROM EnquiryFor ef
                    JOIN Master_EnquiryFor mef
                      ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName)
                    WHERE ef.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(mef.CompanyName)) = @company
                ) `;
        }
        if (safeDivision && safeDivision !== 'All') {
            clause += ` AND EXISTS (
                    SELECT 1
                    FROM EnquiryFor ef
                    JOIN Master_EnquiryFor mef
                      ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName)
                    WHERE ef.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(mef.DepartmentName)) = @division
                ) `;
        }
        if (effectiveSe) {
            if (accountableSeOnly) {
                clause += buildSalesReportProbAccountableSeClause(effectiveSe, seInputName);
            } else {
                clause += ` AND EXISTS (
                    SELECT 1
                    FROM ConcernedSE cse
                    WHERE cse.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(ISNULL(cse.SEName, ''))) = LTRIM(RTRIM(ISNULL(@${seInputName}, '')))
                ) `;
            }
        }
    }
    return clause;
}

function buildSalesReportProbOwnJobClause(safeDivision) {
    return safeDivision && safeDivision !== 'All'
        ? ` AND UPPER(LTRIM(RTRIM(ISNULL(P.OwnJobName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))`
        : '';
}

/**
 * Sales Pipeline funnel + Jobs Follow-up table: latest Probability row per enquiry within division/SE scope.
 */
function buildSalesReportFunnelLatestProbCte(wonPreparedByClause, probScopeClause, enquiryScopeClause, cteName = 'LatestProbFunnelScope') {
    return `
WITH ${cteName} AS (
    SELECT * FROM (
        SELECT P.*,
            ROW_NUMBER() OVER (
                PARTITION BY P.RequestNo
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
    if (key === 'Pending') return `COALESCE(${SQL_PROB_NETQUOTED_PARSED}, ${SQL_LATEST_QUOTE_AMOUNT_PER_ENQUIRY}, CAST(0 AS DECIMAL(18,2)))`;
    if (key === 'Follow Up') return `ISNULL(${SQL_PROB_NETQUOTED_PARSED}, CAST(0 AS DECIMAL(18,2)))`;
    if (key === 'Lost') return `(${SQL_PROB_COMPETITOR_PRICE})`;
    return `(${SQL_PROB_JOB_VALUE})`;
}

/** Selected / logged-in SE for report widgets (ConcernedSE on enquiry — not quote/probability PreparedBy). */
function getSalesReportAssignedSe(req, safeRole) {
    return (
        (req.salesReportForceSeName && String(req.salesReportForceSeName).trim()) ||
        (safeRole && safeRole !== 'All' ? safeRole : null)
    );
}

/**
 * EnquiryMaster scope: non–CC → company + latest Probability.OwnJobName = division + ConcernedSE↔Master email;
 * CC / others → EnquiryFor division/company + optional ConcernedSE by name.
 * @param {object} [opts]
 * @param {boolean} [opts.omitEnquiryMasterDivisionForQuoteOwnJob] — Jobs (Quoted) only: do not require
 *   EnquiryFor / latest Probability division on EnquiryMaster; division is applied on `EnquiryQuotes.OwnJob`
 *   instead (avoids dropping enquiries that have BMS quotes but no BMS line in EnquiryFor).
 */
function appendSalesReportEnquiryFilters(req, request, safeCompany, safeDivision, safeRole, opts = {}) {
    let filterClause = '';
    const isNonCcSalesScope = req.salesReportNonCcScope === true;
    const srUserEmail = req.salesReportUserEmail ? String(req.salesReportUserEmail).trim() : '';
    const omitMasterDivision =
        opts && opts.omitEnquiryMasterDivisionForQuoteOwnJob === true;

    if (isNonCcSalesScope) {
        if (srUserEmail) {
            request.input('srUserEmail', sql.NVarChar, srUserEmail);
        }
        if (req.salesReportNonCcBlock === true) {
            filterClause += ' AND 1=0 ';
        } else if (!srUserEmail) {
            filterClause += ' AND 1=0 ';
        } else {
            if (safeCompany && safeCompany !== 'All') {
                request.input('company', sql.NVarChar, safeCompany);
                filterClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND LTRIM(RTRIM(mef.CompanyName)) = @company) `;
            }
            if (safeDivision && safeDivision !== 'All' && !omitMasterDivision) {
                request.input('division', sql.NVarChar, safeDivision);
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
                      AND UPPER(LTRIM(RTRIM(ISNULL(lp.OwnJobName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                  ) `;
            }
            filterClause += `
                  AND EXISTS (
                    SELECT 1
                    FROM ConcernedSE cs
                    INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                    WHERE cs.RequestNo = E.RequestNo
                      AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(m.EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
                       = LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(@srUserEmail, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
                  ) `;
            if (safeRole && safeRole !== 'All') {
                request.input('seRole', sql.NVarChar, safeRole);
                filterClause += `
                  AND EXISTS (
                    SELECT 1
                    FROM ConcernedSE cse
                    WHERE cse.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(ISNULL(cse.SEName, N''))) = LTRIM(RTRIM(ISNULL(@seRole, N'')))
                  ) `;
            }
        }
    } else if (safeDivision && safeDivision !== 'All' && !omitMasterDivision) {
        request.input('division', sql.NVarChar, safeDivision);
        filterClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND LTRIM(RTRIM(mef.DepartmentName)) = @division) `;
    } else if (safeCompany && safeCompany !== 'All') {
        request.input('company', sql.NVarChar, safeCompany);
        filterClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND LTRIM(RTRIM(mef.CompanyName)) = @company) `;
    }

    if (!isNonCcSalesScope) {
        if (req.salesReportNonCcBlock === true) {
            filterClause += ' AND 1=0 ';
        } else if (req.salesReportForceSeName) {
            const seF = String(req.salesReportForceSeName).trim();
            request.input('se', sql.NVarChar, seF);
            filterClause += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = E.RequestNo AND LTRIM(RTRIM(cse.SEName)) = LTRIM(RTRIM(@se))) `;
        } else if (safeRole && safeRole !== 'All') {
            request.input('se', sql.NVarChar, safeRole);
            filterClause += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = E.RequestNo AND LTRIM(RTRIM(cse.SEName)) = LTRIM(RTRIM(@se))) `;
        }
    }

    if (omitMasterDivision && safeDivision && safeDivision !== 'All') {
        bindInputIfMissing(request, 'division', sql.NVarChar, safeDivision);
    }

    return filterClause;
}

/**
 * Shared request + item-value FROM clause for top-job table and /summary EnquiryMaster queries.
 * @returns {object|null}
 */
function buildSalesReportItemValueContext(req, enquiryScopeOpts) {
    const { year, company, division, role } = req.query;
    if (!year) return null;

    const request = new sql.Request();
    const safeYear = year ? parseInt(year, 10) : null;
    const safeCompany = normalizeReportFilterValue(company);
    const safeDivision = normalizeReportFilterValue(division);
    const safeRole = normalizeReportFilterValue(role);
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
        safeCompany,
        safeDivision,
        safeRole,
        enquiryScopeOpts || {}
    );

    const effectiveSeForTarget =
        (req.salesReportForceSeName && String(req.salesReportForceSeName).trim())
        || safeRole;

    /** SalesTargets filters use @se — non–CC scope uses email on ConcernedSE only, so @se was never bound. */
    if (effectiveSeForTarget && req.salesReportNonCcScope === true) {
        request.input('se', sql.NVarChar, effectiveSeForTarget);
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
    if (safeDivision && safeDivision !== 'All') {
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
                       AND LTRIM(RTRIM(MEF_Inner.DepartmentName)) = @division
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
        safeCompany,
        safeDivision,
        safeRole,
        effectiveSeForTarget,
        nonCcBlock: req.salesReportNonCcBlock === true,
        salesReportNonCcScope: req.salesReportNonCcScope === true,
        safeQuarter,
        quarterNum
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
        const userDepartment = (user.Department || '').trim();
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
        let departmentName = userDepartment;
        if (userDepartment) {
            const companyReq = new sql.Request();
            companyReq.input('dept', sql.NVarChar, userDepartment);
            const companyRes = await companyReq.query(`
                 SELECT TOP 1 CompanyName, DepartmentName
                 FROM Master_EnquiryFor
                 WHERE DepartmentName = @dept
            `);
            if (companyRes.recordset.length > 0) {
                company = (companyRes.recordset[0].CompanyName || '').trim();
                departmentName = (companyRes.recordset[0].DepartmentName || userDepartment).trim();
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
            let divisionSQL = `
                SELECT DISTINCT DepartmentName 
                FROM Master_EnquiryFor 
                WHERE DepartmentName IS NOT NULL AND DepartmentName <> ''
            `;
            if (company && company !== 'All') {
                divisionSQL += ` AND CompanyName = @company `;
                request.input('company', sql.NVarChar, company);
            }
            divisionSQL += ` ORDER BY DepartmentName ASC`;

            // SE list: match company (when set) and division (when set) via Master_EnquiryFor → Department
            let roleSQL = `
                SELECT DISTINCT SE.FullName 
                FROM Master_ConcernedSE SE
                INNER JOIN Master_EnquiryFor M ON LTRIM(RTRIM(M.DepartmentName)) = LTRIM(RTRIM(SE.Department))
                WHERE SE.FullName IS NOT NULL AND SE.FullName <> ''
            `;
            if (company && company !== 'All') {
                roleSQL += ` AND M.CompanyName = @company `;
            }
            if (division && division !== 'All') {
                roleSQL += ` AND SE.Department = @division `;
                request.input('division', sql.NVarChar, division);
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
        const userDepartment = (user.Department || '').trim();
        const userFullName = (user.FullName || '').trim();

        const scopedPairs = await fetchCcMailScopedPairs(scopedEmail);
        const isCcMember = scopedPairs.length > 0;

        if (!isCcMember) {
            let lockedCompany = '';
            if (userDepartment) {
                const cReq = new sql.Request();
                cReq.input('dept', sql.NVarChar, userDepartment);
                const cRes = await cReq.query(`
                    SELECT TOP 1 CompanyName
                    FROM Master_EnquiryFor
                    WHERE DepartmentName = @dept
                `);
                lockedCompany = ((cRes.recordset || [])[0]?.CompanyName || '').trim();
            }
            return res.json({
                years: years.recordset.map(r => r.Year),
                companies: lockedCompany ? [lockedCompany] : [],
                divisions: userDepartment ? [userDepartment] : [],
                roles: userFullName ? [userFullName] : []
            });
        }

        const safeQCompany = normalizeReportFilterValue(company);
        const safeQDivision = normalizeReportFilterValue(division);

        // Always return every company the user can access (CC list from master).
        const companies = [...new Set(scopedPairs.map(r => r.company).filter(Boolean))].sort();

        // Divisions: only those for the selected company; if no company, all CC-scoped divisions.
        const divisionSource = safeQCompany
            ? scopedPairs.filter((p) => p.company === safeQCompany)
            : scopedPairs;
        const divisions = [...new Set(divisionSource.map((r) => r.division).filter(Boolean))].sort();

        // SE names: Master_ConcernedSE in the relevant department(s) for the selected company/division.
        let departmentsForRoles = [];
        if (safeQDivision) {
            const okPair = scopedPairs.some(
                (p) => p.division === safeQDivision && (!safeQCompany || p.company === safeQCompany)
            );
            if (okPair) departmentsForRoles = [safeQDivision];
        } else if (safeQCompany) {
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
        await applySalesReportEmailScope(req);
        const ctx = buildSalesReportItemValueContext(req);
        if (!ctx) return res.status(400).json({ error: 'Year is required' });

        const {
            request,
            filterClause,
            itemValueApply,
            itemValueCol,
            safeYear,
            safeCompany,
            safeDivision,
            safeRole,
            effectiveSeForTarget,
            nonCcBlock,
            safeQuarter,
            quarterNum
        } = ctx;

        const probDateExpr =
            'COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime, E.EnquiryDate)';
        const effectiveQuotedSe = getSalesReportAssignedSe(req, safeRole);
        if (safeCompany && safeCompany !== 'All') {
            bindInputIfMissing(request, 'company', sql.NVarChar, safeCompany);
        }
        if (safeDivision && safeDivision !== 'All') {
            bindInputIfMissing(request, 'division', sql.NVarChar, safeDivision);
        }
        if (effectiveQuotedSe) {
            request.input('quotedSe', sql.NVarChar, effectiveQuotedSe);
        }
        const quotedFilterClause = buildSalesReportEnquiryScopeClause({
            nonCcBlock,
            safeCompany,
            safeDivision,
            effectiveSe: effectiveQuotedSe,
            seInputName: 'quotedSe',
        });
        /** Won / Lost / Follow-up KPIs: only the accountable SE for each lead job (L-code) counts. */
        const quotedAchievementScopeClause = buildSalesReportEnquiryScopeClause({
            nonCcBlock,
            safeCompany,
            safeDivision,
            effectiveSe: effectiveQuotedSe,
            seInputName: 'quotedSe',
            accountableSeOnly: true,
        });

        /** SE scope on enquiry (ConcernedSE) is in quotedFilterClause — not Probability.PreparedBy. */
        const wonPreparedByClause = '';
        const probDivisionScopeClause = safeDivision
            ? ` AND (
                    UPPER(LTRIM(RTRIM(ISNULL(P.OwnJobName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                    OR (
                        LTRIM(RTRIM(ISNULL(P.OwnJobName, ''))) = ''
                        AND UPPER(LTRIM(RTRIM(ISNULL(P.QuoteOwnJob, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                    )
                  )`
            : '';
        const probPartitionByExpr = effectiveQuotedSe
            ? `P.RequestNo`
            : `P.RequestNo, LTRIM(RTRIM(ISNULL(P.PreparedBy, '')))`;
        const quotePartitionByExpr = effectiveQuotedSe
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
            if (safeCompany) {
                targetFilter += ` AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefT
                    WHERE LTRIM(RTRIM(ISNULL(mefT.CompanyName, ''))) = LTRIM(RTRIM(ISNULL(@company, '')))
                      AND (
                        LTRIM(RTRIM(ISNULL(mefT.DepartmentName, ''))) = LTRIM(RTRIM(ISNULL(SalesTargets.Division, '')))
                        OR LTRIM(RTRIM(ISNULL(mefT.ItemName, ''))) = LTRIM(RTRIM(ISNULL(SalesTargets.Division, '')))
                      )
                ) `;
            }
            if (safeDivision) targetFilter += ' AND Division = @division ';
            if (effectiveSeForTarget) targetFilter += ' AND SalesEngineer = @se ';
        }
        if (safeQuarter) targetFilter += ' AND Quarter = @quarterStrs ';

        const targetRes = await request.query(`
            SELECT Quarter, SUM(ISNULL(TargetValue, 0)) as TotalTarget
            FROM SalesTargets
            ${targetFilter}
            GROUP BY Quarter
        `);

        // Actual job booking: latest row per enquiry; if Won, sum FinalJobValueBooked by quarter
        let actualRes = { recordset: [] };
        try {
            actualRes = await request.query(`
            ${latestProbByUpdateCte}
            SELECT DATEPART(QUARTER, COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) AS Q,
                SUM(${SQL_PROB_WON_VALUE}) AS TotalActual
            FROM LatestProbByUpdate P
            INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
            WHERE LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) = 'won'
              AND YEAR(COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @year
              ${safeQuarter ? `AND DATEPART(QUARTER, COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @quarterNums` : ''}
            GROUP BY DATEPART(QUARTER, COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate))
            `);
        } catch (e) {
            console.warn('[Sales Report] Probability actual fallback:', e.message);
            actualRes = await request.query(`
                SELECT DATEPART(QUARTER, ExpectedOrderDate) as Q, SUM(${itemValueCol}) as TotalActual
                FROM EnquiryMaster E
                ${itemValueApply}
                WHERE Status = 'Won' AND YEAR(ExpectedOrderDate) = @year ${filterClause}
                ${safeQuarter ? 'AND DATEPART(QUARTER, ExpectedOrderDate) = @quarterNums' : ''}
                GROUP BY DATEPART(QUARTER, ExpectedOrderDate)
            `);
        }

        let gmTargetRes = { recordset: [] };
        let gmActualRes = { recordset: [] };
        let wonAvgGpRes = { recordset: [] };
        let avgWonBookedGpPct = null;
        try {
            gmTargetRes = await request.query(`
                SELECT
                    Quarter,
                    SUM(ISNULL(TargetValue, 0) * ISNULL(GrossProfitTarget, 0) / 100.0) AS TotalTarget,
                    SUM(ISNULL(TargetValue, 0)) AS TotalSalesTarget
                FROM SalesTargets
                ${targetFilter}
                GROUP BY Quarter
            `);
            gmActualRes = await request.query(`
            ${latestProbByUpdateCte}
                SELECT DATEPART(QUARTER, COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) AS Q,
                    SUM((${SQL_PROB_WON_VALUE}) * ISNULL(P.GrossMargin, 0) / 100.0) AS TotalActual
                FROM LatestProbByUpdate P
                INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
                WHERE LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) = 'won'
                  AND YEAR(COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @year
                  ${safeQuarter ? `AND DATEPART(QUARTER, COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @quarterNums` : ''}
                GROUP BY DATEPART(QUARTER, COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate))
            `);
            wonAvgGpRes = await request.query(`
            ${latestProbByUpdateCte}
                SELECT AVG(CAST(ISNULL(P.GrossMargin, 0) AS DECIMAL(18, 4))) AS AvgBookedGpPct
                FROM LatestProbByUpdate P
                INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
                WHERE LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) = 'won'
                  AND YEAR(COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @year
                  ${safeQuarter ? `AND DATEPART(QUARTER, COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @quarterNums` : ''}
            `);
            const avgRow = wonAvgGpRes.recordset && wonAvgGpRes.recordset[0];
            if (avgRow && avgRow.AvgBookedGpPct != null) {
                avgWonBookedGpPct = Number(avgRow.AvgBookedGpPct);
            }
        } catch (gmErr) {
            console.warn('[Sales Report] Gross margin summary skipped:', gmErr.message);
        }

        /** Won counts/values: latest row by UpdatedDateTime; include only if that row is Won. */
        let wonKpiRes = { recordset: [{ Cnt: 0, TotalValue: 0 }] };
        try {
            wonKpiRes = await request.query(`
            ${latestProbByUpdateCte}
            SELECT COUNT(*) AS Cnt, SUM(${SQL_PROB_WON_VALUE}) AS TotalValue
            FROM LatestProbByUpdate P
            INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
            WHERE LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) = 'won'
              AND YEAR(COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @year
              ${safeQuarter ? `AND DATEPART(QUARTER, COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @quarterNums` : ''}
            `);
        } catch (wonKpiErr) {
            console.warn('[Sales Report] Won KPI from Probability:', wonKpiErr.message);
        }

        /** Lost KPI: latest row per enquiry; if status Lost, sum CompetitorPrice (not stale Lost rows). */
        let lostKpiRes = { recordset: [{ Cnt: 0, TotalValue: 0 }] };
        try {
            lostKpiRes = await request.query(`
            ${latestProbByUpdateCte}
            SELECT COUNT(*) AS Cnt, SUM(${SQL_PROB_COMPETITOR_PRICE}) AS TotalValue
            FROM LatestProbByUpdate P
            INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
            WHERE LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%lost%'
              AND YEAR(COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @year
              ${safeQuarter ? `AND DATEPART(QUARTER, COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @quarterNums` : ''}
            `);
        } catch (lostKpiErr) {
            console.warn('[Sales Report] Lost KPI from Probability:', lostKpiErr.message);
        }

        /** Follow-up KPI: latest row per enquiry; if status Follow-up, sum NetQuotedValue. */
        let followUpKpiRes = { recordset: [{ Cnt: 0, TotalValue: 0 }] };
        try {
            followUpKpiRes = await request.query(`
            ${latestProbByUpdateCte}
            SELECT COUNT(*) AS Cnt, SUM(${SQL_PROB_NETQUOTED_SUM}) AS TotalValue
            FROM LatestProbByUpdate P
            INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
            WHERE LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%follow%'
              AND YEAR(COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @year
              ${safeQuarter ? `AND DATEPART(QUARTER, COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @quarterNums` : ''}
            `);
        } catch (fuKpiErr) {
            console.warn('[Sales Report] Follow-up KPI from Probability:', fuKpiErr.message);
        }

        // Quoted slice: highest quote amount per enquiry in selected scope, then sum.
        const quotedRes = await request.query(`
            WITH FilteredEnquiries AS (
                SELECT DISTINCT E.RequestNo
                FROM EnquiryMaster E
                WHERE 1=1 ${quotedFilterClause}
            ),
            CandidateQuotes AS (
                SELECT
                    EQ.RequestNo,
                    ISNULL(
                        TRY_CONVERT(
                            DECIMAL(18,2),
                            REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EQ.TotalAmount, '0'))), ',', ''), 'BD', ''), ' ', '')
                        ),
                        0
                    ) AS ParsedAmount,
                    COALESCE(EQ.UpdatedAt, EQ.QuoteDate) AS QuoteDate
                FROM EnquiryQuotes EQ
                WHERE 1=1
                  ${safeDivision ? `AND EXISTS (
                        SELECT 1
                        FROM Master_EnquiryFor mefQ
                        WHERE (
                            UPPER(LTRIM(RTRIM(ISNULL(mefQ.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                            OR UPPER(LTRIM(RTRIM(ISNULL(mefQ.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                        )
                          AND LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, ''))) <> ''
                          AND (
                              CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(EQ.QuoteNumber, ''))) > 0
                              OR CHARINDEX('-' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(EQ.QuoteNumber, ''))) > 0
                              OR CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '-', UPPER(ISNULL(EQ.QuoteNumber, ''))) > 0
                          )
                    )` : ''}
            ),
            HighestQuotePerReq AS (
                SELECT
                    CQ.RequestNo,
                    MAX(CQ.ParsedAmount) AS HighestQuoteAmount,
                    MAX(CQ.QuoteDate) AS LatestQuoteDate
                FROM CandidateQuotes CQ
                GROUP BY CQ.RequestNo
            )
            SELECT 
                COUNT(DISTINCT FE.RequestNo) as Cnt,
                SUM(ISNULL(H.HighestQuoteAmount, 0)) as TotalValue
            FROM FilteredEnquiries FE
            INNER JOIN HighestQuotePerReq H ON H.RequestNo = FE.RequestNo
            WHERE YEAR(COALESCE(H.LatestQuoteDate, GETDATE())) = @year
              ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(H.LatestQuoteDate, GETDATE())) = @quarterNums' : ''}
        `);

        // 3. Top 10 Customers
        const topCustomersQuery = `
            SELECT TOP 10 WonCustomerName as name, SUM(${itemValueCol}) as value
            FROM EnquiryMaster E
            ${itemValueApply}
            WHERE Status = 'Won' AND YEAR(ExpectedOrderDate) = @year ${filterClause}
              AND WonCustomerName IS NOT NULL AND WonCustomerName <> ''
              ${safeQuarter ? 'AND DATEPART(QUARTER, ExpectedOrderDate) = @quarterNums' : ''}
            GROUP BY WonCustomerName
            ORDER BY value DESC
        `;
        const topCustomersRes = await request.query(topCustomersQuery);

        // 4. Top 10 Projects
        const topProjectsQuery = `
            SELECT TOP 10 ProjectName as name, SUM(${itemValueCol}) as value
            FROM EnquiryMaster E
            ${itemValueApply}
            WHERE Status = 'Won' AND YEAR(ExpectedOrderDate) = @year ${filterClause}
              AND ProjectName IS NOT NULL AND ProjectName <> ''
              ${safeQuarter ? 'AND DATEPART(QUARTER, ExpectedOrderDate) = @quarterNums' : ''}
            GROUP BY ProjectName
            ORDER BY value DESC
        `;
        const topProjectsRes = await request.query(topProjectsQuery);

        // 5. Top 10 Clients (from EnquiryMaster ClientName)
        const topClientsQuery = `
            SELECT TOP 10 E.ClientName as name, SUM(${itemValueCol}) as value
            FROM EnquiryMaster E
            ${itemValueApply}
            WHERE E.Status = 'Won' AND YEAR(E.ExpectedOrderDate) = @year ${filterClause}
              AND E.ClientName IS NOT NULL AND E.ClientName <> ''
              ${safeQuarter ? 'AND DATEPART(QUARTER, E.ExpectedOrderDate) = @quarterNums' : ''}
            GROUP BY E.ClientName
            ORDER BY value DESC
        `;
        const topClientsRes = await request.query(topClientsQuery);

        const topJobProbWhere = getTopJobProbStatusWhere('Won', req);
        const topJobDateExpr = `COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime, ${SQL_LATEST_QUOTE_DATE_PER_ENQUIRY}, E.EnquiryDate)`;
        let topJobBookedRes = { recordset: [] };
        try {
            topJobBookedRes = await request.query(`
            ${latestProbByUpdateCte}
            SELECT
                x.RequestNo,
                x.ProjectName,
                x.JobValue,
                x.WonGrossProfit,
                x.CustomerName,
                x.ClientName,
                x.ConsultantName
            FROM (
                SELECT
                    E.RequestNo,
                    E.ProjectName,
                    (${SQL_PROB_WON_VALUE}) AS JobValue,
                    P.GrossMargin AS WonGrossProfit,
                    LTRIM(RTRIM(ISNULL(P.ToName, ISNULL(E.WonCustomerName, E.CustomerName)))) AS CustomerName,
                    E.ClientName,
                    E.ConsultantName
                FROM EnquiryMaster E
                LEFT JOIN LatestProbByUpdate P ON E.RequestNo = P.RequestNo
                WHERE ${topJobProbWhere}
                  AND YEAR(${topJobDateExpr}) = @year
                  ${effectiveQuotedSe ? buildSalesReportProbAccountableSeClause(effectiveQuotedSe, 'quotedSe') : ''}
                  ${safeQuarter ? `AND DATEPART(QUARTER, ${topJobDateExpr}) = @quarterNums` : ''}
            ) x
            ORDER BY x.JobValue DESC
            `);
        } catch (tjErr) {
            console.warn('[Sales Report] Top jobs Probability fallback:', tjErr.message);
            topJobBookedRes = await request.query(`
            SELECT
                x.RequestNo,
                x.ProjectName,
                x.JobValue,
                x.WonGrossProfit,
                x.CustomerName,
                x.ClientName,
                x.ConsultantName
            FROM (
                SELECT
                    E.RequestNo,
                    E.ProjectName,
                    ${itemValueCol} AS JobValue,
                    E.WonGrossProfit AS WonGrossProfit,
                    LTRIM(RTRIM(ISNULL(E.WonCustomerName, E.CustomerName))) AS CustomerName,
                    E.ClientName,
                    E.ConsultantName
                FROM EnquiryMaster E
                ${itemValueApply}
                WHERE ${TOP_JOB_BOOKED_STATUS_SQL.Won}
                  AND YEAR(E.ExpectedOrderDate) = @year ${filterClause}
                  ${safeQuarter ? 'AND DATEPART(QUARTER, E.ExpectedOrderDate) = @quarterNums' : ''}
            ) x
            ORDER BY x.JobValue DESC
        `);
        }

        const safeDivisionForFunnel = sanitizeInput(req.query.division);
        const funnelProbScopeClause = buildSalesReportProbOwnJobClause(safeDivisionForFunnel);
        const funnelLatestProbCte = buildSalesReportFunnelLatestProbCte(
            wonPreparedByClause,
            funnelProbScopeClause,
            quotedAchievementScopeClause
        );
        let probabilityFunnelRes = { recordset: [] };
        try {
            probabilityFunnelRes = await request.query(`
            ${funnelLatestProbCte}
            SELECT 
                MAX(LTRIM(RTRIM(ISNULL(P.ProbabilityChance, '')))) AS ProbabilityName,
                ${SQL_PROB_CHANCE_PCT_EXPR} AS ProbabilityPercentage,
                SUM(${SQL_FUNNEL_NET_QUOTED_VALUE}) AS TotalValue,
                COUNT(*) AS Count
            FROM LatestProbFunnelScope P
            INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
            WHERE YEAR(${probDateExpr}) = @year
              ${safeQuarter ? `AND DATEPART(QUARTER, ${probDateExpr}) = @quarterNums` : ''}
              AND ${SQL_FUNNEL_FOLLOWUP_STATUS}
            GROUP BY ${SQL_PROB_CHANCE_PCT_EXPR}
            HAVING ${SQL_PROB_CHANCE_PCT_EXPR} IS NOT NULL
            ORDER BY ProbabilityPercentage ASC
            `);
        } catch (pfErr) {
            console.warn('[Sales Report] Funnel Probability fallback:', pfErr.message);
            probabilityFunnelRes = await request.query(`
            ${funnelLatestProbCte}
            SELECT 
                MAX(LTRIM(RTRIM(ISNULL(P.ProbabilityChance, '')))) AS ProbabilityName,
                ${SQL_PROB_CHANCE_PCT_EXPR} AS ProbabilityPercentage,
                SUM(${SQL_FUNNEL_NET_QUOTED_VALUE}) AS TotalValue,
                COUNT(*) AS Count
            FROM LatestProbFunnelScope P
            INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
            WHERE YEAR(${probDateExpr}) = @year
              ${safeQuarter ? `AND DATEPART(QUARTER, ${probDateExpr}) = @quarterNums` : ''}
              AND ${SQL_FUNNEL_FOLLOWUP_STATUS}
            GROUP BY ${SQL_PROB_CHANCE_PCT_EXPR}
            HAVING ${SQL_PROB_CHANCE_PCT_EXPR} IS NOT NULL
            ORDER BY ProbabilityPercentage ASC
        `);
        }

        /**
         * 10% Quoted (pending probability update):
         * Include when:
         * 1) no Probability row exists (quoted but not updated yet), OR
         * 2) latest Probability status is Pending with blank ProbabilityChance.
         * Excludes any latest status identified as Won/Lost/Follow-up/Hold/Cancel/Retender.
         */
        let quotedPendingProbabilityRes = { recordset: [] };
        try {
            quotedPendingProbabilityRes = await request.query(`
            WITH LatestProbPendingScope AS (
                SELECT * FROM (
                    SELECT
                        P.*,
                        ROW_NUMBER() OVER (PARTITION BY P.RequestNo ORDER BY P.UpdatedDateTime DESC) AS __rn
                    FROM dbo.Probability P
                    INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
                    WHERE 1 = 1
                      ${wonPreparedByClause}
                      ${quotedFilterClause}
                ) __lp WHERE __lp.__rn = 1
            )
            , LatestQuotePerReq AS (
                SELECT
                    z.RequestNo,
                    z.Amount AS LatestQuoteAmount,
                    z.LatestQuoteDate
                FROM (
                    SELECT
                        EQ.RequestNo,
                        ISNULL(
                            TRY_CONVERT(
                                DECIMAL(18,2),
                                REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EQ.TotalAmount, '0'))), ',', ''), 'BD', ''), ' ', '')
                            ),
                            0
                        ) AS Amount,
                        COALESCE(EQ.UpdatedAt, EQ.QuoteDate) AS LatestQuoteDate,
                        ROW_NUMBER() OVER (
                            PARTITION BY EQ.RequestNo
                            ORDER BY
                                ISNULL(EQ.QuoteNo, 0) DESC,
                                ISNULL(EQ.UpdatedAt, EQ.QuoteDate) DESC,
                                EQ.QuoteDate DESC
                        ) AS __rn
                    FROM EnquiryQuotes EQ
                ) z
                WHERE z.__rn = 1
            )
            SELECT
                COUNT(*) AS Cnt,
                SUM(
                    COALESCE(
                        ${SQL_PROB_NETQUOTED_PARSED},
                        ISNULL(LQ.LatestQuoteAmount, 0),
                        CAST(0 AS DECIMAL(18,2))
                    )
                ) AS TotalValue
            FROM EnquiryMaster E
            LEFT JOIN LatestProbPendingScope P ON P.RequestNo = E.RequestNo
            LEFT JOIN LatestQuotePerReq LQ ON LQ.RequestNo = E.RequestNo
            WHERE YEAR(COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime, LQ.LatestQuoteDate, E.ExpectedOrderDate, E.EnquiryDate)) = @year ${quotedFilterClause}
              ${safeQuarter ? `AND DATEPART(QUARTER, COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime, LQ.LatestQuoteDate, E.ExpectedOrderDate, E.EnquiryDate)) = @quarterNums` : ''}
              AND (
                    P.RequestNo IS NULL
                    OR (
                        REPLACE(REPLACE(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))), '-', ''), ' ', '') IN ('pending', 'quote', 'quoted')
                    )
                  )
            `);
        } catch (qpErr) {
            console.warn('[Sales Report] Quoted-pending probability aggregate:', qpErr.message);
        }

        const qp0 = (quotedPendingProbabilityRes.recordset && quotedPendingProbabilityRes.recordset[0]) || {};
        const pendingQuotedValue = Number(qp0.TotalValue) || 0;
        const pendingQuotedCount = Number(qp0.Cnt) || 0;
        if (pendingQuotedValue > 0 || pendingQuotedCount > 0) {
            const rows = probabilityFunnelRes.recordset || [];
            const tenIdx = rows.findIndex((r) => Number(r.ProbabilityPercentage) === 10);
            if (tenIdx >= 0) {
                rows[tenIdx].TotalValue = (Number(rows[tenIdx].TotalValue) || 0) + pendingQuotedValue;
                rows[tenIdx].Count = (Number(rows[tenIdx].Count) || 0) + pendingQuotedCount;
                if (!rows[tenIdx].ProbabilityName || String(rows[tenIdx].ProbabilityName).trim() === '') {
                    rows[tenIdx].ProbabilityName = 'Quoted';
                }
            } else {
                rows.push({
                    ProbabilityName: 'Quoted',
                    ProbabilityPercentage: 10,
                    TotalValue: pendingQuotedValue,
                    Count: pendingQuotedCount
                });
            }
            probabilityFunnelRes.recordset = rows.sort(
                (a, b) => (Number(a.ProbabilityPercentage) || 0) - (Number(b.ProbabilityPercentage) || 0)
            );
        }

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
            { name: 'Q1', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 },
            { name: 'Q2', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 },
            { name: 'Q3', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 },
            { name: 'Q4', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 }
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
            if (gmQuarters[r.Q - 1]) gmQuarters[r.Q - 1].actual = r.TotalActual;
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


        // 7. Item Wise Stats (Target vs Actual vs Breakdown)
        // Determine Grouping/Filtering based on Granularity
        let itemWiseGroupBy = 'mef.DepartmentName';
        let itemWiseSelect = 'mef.DepartmentName as ItemName';
        let itemWiseWhere = '';

        // If a specific role is selected, we want Granular View (Item Level)
        // If only Division is selected, we want Division Level (DepartmentName)
        if (safeRole && safeRole !== 'All') {
            itemWiseGroupBy = 'mef.ItemName';
            itemWiseSelect = 'mef.ItemName as ItemName';
        }

        // Strict filtering to remove unwanted cross-division items (e.g. Civil items appearing in BMS view)
        if (safeDivision && safeDivision !== 'All') {
            itemWiseWhere += ` AND mef.DepartmentName = @division `;
        }

        // 7. Item Wise Stats (Target vs Actual vs Breakdown) (Optimized to sum Item Values correctly)
        // If division is active, we are already summing item values via valueExpression logic conceptually, but for Item Wise we want Granular sums.
        // The original query was simply summing WonOrderValue multiple times which is bad. 
        // We will rewrite Item Wise to join EnquiryPricingValues directly.

        const itemWiseRes = await request.query(`
            SELECT 
                ${itemWiseSelect},
                SUM(CASE WHEN E.Status = 'Won' THEN ISNULL(EPV.Price, 0) ELSE 0 END) as WonValue,
                SUM(CASE WHEN E.Status = 'Lost' THEN ISNULL(EPV.Price, 0) ELSE 0 END) as LostValue,
                SUM(CASE WHEN E.Status IN ('Follow-up', 'FollowUp') THEN ISNULL(EPV.Price, 0) ELSE 0 END) as FollowUpValue
            FROM EnquiryMaster E
            JOIN EnquiryFor EF ON E.RequestNo = EF.RequestNo
            JOIN Master_EnquiryFor mef ON (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '%- ' + mef.ItemName OR EF.ItemName LIKE '%-' + mef.ItemName)
            OUTER APPLY (
                 SELECT SUM(ISNULL(Price, 0)) as Price
                 FROM EnquiryPricingValues EPV
                 WHERE EPV.RequestNo = EF.RequestNo 
                   AND (EPV.EnquiryForID = EF.ID OR EPV.EnquiryForItem = EF.ItemName)
            ) EPV
            WHERE YEAR(COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @year ${filterClause} ${itemWiseWhere}
            ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @quarterNums' : ''}
            GROUP BY ${itemWiseGroupBy}
        `);

        // Get Targets by ItemName (instead of just Division) to support granular breakdown logic
        const requestTarget = new sql.Request();
        requestTarget.input('year', sql.Int, safeYear);
        if (safeQuarter) {
            requestTarget.input('quarterStr', sql.NVarChar, safeQuarter);
        }
        if (safeCompany) {
            requestTarget.input('company', sql.NVarChar, safeCompany);
        }

        let targetQuery = '';

        if (safeRole) {
            requestTarget.input('se', sql.NVarChar, safeRole);
            targetQuery = `
                SELECT ItemName as Name, SUM(ISNULL(TargetValue, 0)) as Target
                FROM SalesTargets
                WHERE FinancialYear = @year AND SalesEngineer = @se
                ${safeCompany ? `AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefT
                    WHERE LTRIM(RTRIM(ISNULL(mefT.CompanyName, ''))) = LTRIM(RTRIM(ISNULL(@company, '')))
                      AND (
                        LTRIM(RTRIM(ISNULL(mefT.DepartmentName, ''))) = LTRIM(RTRIM(ISNULL(SalesTargets.Division, '')))
                        OR LTRIM(RTRIM(ISNULL(mefT.ItemName, ''))) = LTRIM(RTRIM(ISNULL(SalesTargets.Division, '')))
                      )
                ) ` : ''}
                ${safeQuarter ? 'AND Quarter = @quarterStr ' : ''}
                GROUP BY ItemName
            `;
        } else {
            if (safeDivision) {
                requestTarget.input('division', sql.NVarChar, safeDivision);
            }
            targetQuery = `
                SELECT Division as Name, SUM(ISNULL(TargetValue, 0)) as Target
                FROM SalesTargets
                WHERE FinancialYear = @year
                ${safeCompany ? `AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefT
                    WHERE LTRIM(RTRIM(ISNULL(mefT.CompanyName, ''))) = LTRIM(RTRIM(ISNULL(@company, '')))
                      AND (
                        LTRIM(RTRIM(ISNULL(mefT.DepartmentName, ''))) = LTRIM(RTRIM(ISNULL(SalesTargets.Division, '')))
                        OR LTRIM(RTRIM(ISNULL(mefT.ItemName, ''))) = LTRIM(RTRIM(ISNULL(SalesTargets.Division, '')))
                      )
                ) ` : ''}
                ${safeDivision ? 'AND Division = @division ' : ''}
                ${safeQuarter ? 'AND Quarter = @quarterStr ' : ''}
                GROUP BY Division
            `;
        }

        const targetByDivRes = await requestTarget.query(targetQuery);

        // Merge Target into ItemWise stats
        const itemWiseMap = {};

        // Process Actuals
        itemWiseRes.recordset.forEach(r => {
            const name = r.ItemName || 'Unknown';
            if (!itemWiseMap[name]) itemWiseMap[name] = { name, won: 0, lost: 0, followUp: 0, target: 0 };
            itemWiseMap[name].won = r.WonValue;
            itemWiseMap[name].lost = r.LostValue;
            itemWiseMap[name].followUp = r.FollowUpValue;
        });

        // Process Targets
        targetByDivRes.recordset.forEach(r => {
            const name = r.Name || 'Unknown';
            if (!itemWiseMap[name]) itemWiseMap[name] = { name, won: 0, lost: 0, followUp: 0, target: 0 };
            itemWiseMap[name].target += r.Target;
        });

        const itemWiseStats = Object.values(itemWiseMap).filter(i => i.name !== 'Unknown');

        res.json({
            targetVsActual: quarters,
            grossMarginTargetVsActual: gmQuarters,
            avgWonBookedGpPct,
            winLoss: winLoss,
            topCustomers: topCustomersRes.recordset,
            topProjects: topProjectsRes.recordset,
            topClients: topClientsRes.recordset,
            probabilityFunnel: probabilityFunnelRes.recordset,
            itemWiseStats: itemWiseStats,
            topJobBooked: (topJobBookedRes.recordset || []).map((r) => ({
                RequestNo: r.RequestNo,
                ProjectName: r.ProjectName,
                JobValue: r.JobValue,
                WonGrossProfit: r.WonGrossProfit,
                CustomerName: r.CustomerName,
                ClientName: r.ClientName,
                ConsultantName: r.ConsultantName
            }))
        });

    } catch (err) {
        console.error('Error fetching Sales Report summary:', err);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

/** Top Jobs table only — same filters as /summary; optional topJobStatus (Won, Lost, …). No full dashboard payload. */
router.get('/top-job-booked', async (req, res) => {
    try {
        await applySalesReportEmailScope(req);
        const topJobStatusKey = sanitizeInput(req.query.topJobStatus) || 'Won';
        const ctx = buildSalesReportItemValueContext(
            req,
            topJobStatusKey === 'Quoted' ? { omitEnquiryMasterDivisionForQuoteOwnJob: true } : {}
        );
        if (!ctx) return res.status(400).json({ error: 'Year is required' });

        const { request, filterClause, itemValueApply, itemValueCol, safeQuarter, safeCompany, safeDivision, safeRole, nonCcBlock } = ctx;
        const probDateExpr =
            'COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime, E.EnquiryDate)';
        const topJobProbWhere = getTopJobProbStatusWhere(req.query.topJobStatus, req);
        const topJobValueExpr = getTopJobProbValueExpr(req.query.topJobStatus);
        const topJobDateExpr = `COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime, ${SQL_LATEST_QUOTE_DATE_PER_ENQUIRY}, E.EnquiryDate)`;
        const effectiveQuotedSe = getSalesReportAssignedSe(req, safeRole);
        if (safeCompany && safeCompany !== 'All') {
            bindInputIfMissing(request, 'company', sql.NVarChar, safeCompany);
        }
        if (safeDivision && safeDivision !== 'All') {
            bindInputIfMissing(request, 'division', sql.NVarChar, safeDivision);
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
                if (safeCompany && safeCompany !== 'All') {
                    wonTopJobFilterClause += ` AND EXISTS (
                        SELECT 1
                        FROM EnquiryFor ef
                        JOIN Master_EnquiryFor mef
                          ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName)
                        WHERE ef.RequestNo = E.RequestNo
                          AND LTRIM(RTRIM(mef.CompanyName)) = @company
                    ) `;
                }
                if (safeDivision && safeDivision !== 'All') {
                    wonTopJobFilterClause += ` AND EXISTS (
                        SELECT 1
                        FROM EnquiryFor ef
                        JOIN Master_EnquiryFor mef
                          ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName)
                        WHERE ef.RequestNo = E.RequestNo
                          AND LTRIM(RTRIM(mef.DepartmentName)) = @division
                    ) `;
                }
                if (effectiveQuotedSe) {
                    request.input('wonSe', sql.NVarChar, effectiveQuotedSe);
                    wonTopJobFilterClause += buildSalesReportProbAccountableSeClause(effectiveQuotedSe, 'wonSe');
                }
            }
        }
        let statusTopJobFilterClause = '';
        if (isLostTopJob || isFollowUpTopJob) {
            if (effectiveQuotedSe) {
                request.input('statusSe', sql.NVarChar, effectiveQuotedSe);
            }
            statusTopJobFilterClause = buildSalesReportEnquiryScopeClause({
                nonCcBlock,
                safeCompany,
                safeDivision,
                effectiveSe: effectiveQuotedSe,
                seInputName: 'statusSe',
                accountableSeOnly: true,
            });
        }
        /**
         * Pending table scope:
         * - **CC / unlocked:** use `filterClause` so the list matches other report widgets for the same dropdowns.
         * - **Non–CC (`salesReportNonCcScope`):** `filterClause` ties division to **latest Probability per enquiry**;
         *   the Pending CTE is **per job line** (`PARTITION BY RequestNo, OwnJobName, LeadJobName`). Applying
         *   `filterClause` inside that CTE removes all lines for many enquiries → empty table. For non–CC Pending
         *   only, use EnquiryFor + Master division + ConcernedSE-by-name (previous behaviour).
         */
        let pendingTopJobFilterClause = '';
        if (isPendingTopJob && req.salesReportNonCcScope === true) {
            if (nonCcBlock) {
                pendingTopJobFilterClause += ' AND 1=0 ';
            } else {
                if (safeCompany && safeCompany !== 'All') {
                    pendingTopJobFilterClause += ` AND EXISTS (
                        SELECT 1
                        FROM EnquiryFor ef
                        JOIN Master_EnquiryFor mef
                          ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName)
                        WHERE ef.RequestNo = E.RequestNo
                          AND LTRIM(RTRIM(mef.CompanyName)) = @company
                    ) `;
                }
                if (safeDivision && safeDivision !== 'All') {
                    pendingTopJobFilterClause += ` AND EXISTS (
                        SELECT 1
                        FROM EnquiryFor ef
                        JOIN Master_EnquiryFor mef
                          ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName)
                        WHERE ef.RequestNo = E.RequestNo
                          AND LTRIM(RTRIM(mef.DepartmentName)) = @division
                    ) `;
                }
                if (effectiveQuotedSe) {
                    bindInputIfMissing(request, 'pendingSe', sql.NVarChar, effectiveQuotedSe);
                    pendingTopJobFilterClause += ` AND EXISTS (
                        SELECT 1
                        FROM ConcernedSE cse
                        WHERE cse.RequestNo = E.RequestNo
                          AND LTRIM(RTRIM(ISNULL(cse.SEName, ''))) = LTRIM(RTRIM(ISNULL(@pendingSe, '')))
                    ) `;
                }
            }
        }
        const topJobScopeClause =
            isPendingTopJob && req.salesReportNonCcScope === true
                ? pendingTopJobFilterClause
                : filterClause;

        let topJobBookedRes = { recordset: [] };
        try {
            if (isQuotedTopJob) {
                /**
                 * SE scope: only `filterClause` (ConcernedSE / non‑CC email). Never EnquiryQuotes.PreparedBy.
                 * Division: dropdown matches **`EnquiryQuotes.OwnJob`** only (not LeadJob, not EnquiryFor).
                 * For Jobs (Quoted), `omitEnquiryMasterDivisionForQuoteOwnJob` skips EnquiryFor / Probability
                 * division on EnquiryMaster so enquiries with BMS quotes are not dropped when EnquiryFor has no BMS line.
                 */
                const quotedEqOwnJobExpr = `LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))`;
                const quotedOwnJobDivisionClause =
                    safeDivision && safeDivision !== 'All'
                        ? ` AND UPPER(${quotedEqOwnJobExpr}) = UPPER(LTRIM(RTRIM(ISNULL(@division, N''))))`
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
                      ${filterClause}
                ) __lq
                WHERE __lq.__rn = 1
            )
            SELECT
                x.RequestNo,
                x.ProjectName,
                x.LeadJob,
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
                const wonOwnJobClause = safeDivision && safeDivision !== 'All'
                    ? ` AND UPPER(LTRIM(RTRIM(ISNULL(P.OwnJobName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))`
                    : '';
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
                FROM EnquiryMaster E
                LEFT JOIN LatestProbWonScope P ON E.RequestNo = P.RequestNo
                OUTER APPLY (
                    SELECT TOP 1 Q.QuoteDate, Q.QuoteType
                    FROM EnquiryQuotes Q
                    WHERE LTRIM(RTRIM(ISNULL(Q.QuoteNumber, N''))) = LTRIM(RTRIM(ISNULL(P.QuoteRef, N'')))
                    ORDER BY ISNULL(Q.RevisionNo, 0) DESC, Q.ID DESC
                ) wonQ
                WHERE ${wonProbWhere}
                  AND YEAR(COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @year
                  ${effectiveQuotedSe ? buildSalesReportProbAccountableSeClause(effectiveQuotedSe, 'wonSe') : ''}
                  ${safeQuarter ? `AND DATEPART(QUARTER, COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) = @quarterNums` : ''}
            ) x
            ORDER BY x.JobValue DESC
            `);
            } else if (isLostTopJob || isFollowUpTopJob) {
                const followUpStatusWhere = `(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%follow%')`;
                const statusPreparedByClause = '';
                const statusOwnJobClause = buildSalesReportProbOwnJobClause(safeDivision);
                topJobBookedRes = await request.query(`
            ${buildSalesReportFunnelLatestProbCte(statusPreparedByClause, statusOwnJobClause, statusTopJobFilterClause, 'LatestProbStatusScope')}
            SELECT
                x.RequestNo,
                x.ProjectName,
                x.LeadJob,
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
                FROM EnquiryMaster E
                LEFT JOIN LatestProbStatusScope P ON E.RequestNo = P.RequestNo
                OUTER APPLY (
                    SELECT TOP 1 Q.QuoteDate, Q.QuoteType
                    FROM EnquiryQuotes Q
                    WHERE LTRIM(RTRIM(ISNULL(Q.QuoteNumber, N''))) = LTRIM(RTRIM(ISNULL(P.QuoteRef, N'')))
                    ORDER BY ISNULL(Q.RevisionNo, 0) DESC, Q.ID DESC
                ) wonQ
                WHERE ${isFollowUpTopJob ? followUpStatusWhere : topJobProbWhere}
                  AND YEAR(${probDateExpr}) = @year
                  ${effectiveQuotedSe ? buildSalesReportProbAccountableSeClause(effectiveQuotedSe, 'statusSe') : ''}
                  ${safeQuarter ? `AND DATEPART(QUARTER, ${probDateExpr}) = @quarterNums` : ''}
            ) x
            ORDER BY x.JobValue DESC
            `);
            } else if (isPendingTopJob) {
                const pendingPreparedByClause = '';
                const pendingNoProbQuoteSeClause = '';
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
                      ${pendingPreparedByClause}
                      ${topJobScopeClause}
                ) __lp
                WHERE __lp.__rn = 1
            )
            SELECT
                x.RequestNo,
                x.ProjectName,
                x.LeadJob,
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
                LEFT JOIN LatestProbPendingScope P ON E.RequestNo = P.RequestNo
                WHERE (
                        (P.RequestNo IS NOT NULL AND LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%pending%')
                        OR (
                            P.RequestNo IS NULL
                            AND EXISTS (SELECT 1 FROM EnquiryQuotes EQ WHERE EQ.RequestNo = E.RequestNo)
                            ${pendingNoProbQuoteSeClause}
                        )
                      )
                  AND YEAR(${topJobDateExpr}) = @year ${topJobScopeClause}
                  ${safeQuarter ? `AND DATEPART(QUARTER, ${topJobDateExpr}) = @quarterNums` : ''}
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
            if (safeDivision && safeDivision !== 'All') {
                seReq.input('division', sql.NVarChar, safeDivision);
            }
            const seRowsRes = await seReq.query(`
                SELECT
                    cse.RequestNo,
                    LTRIM(RTRIM(ISNULL(cse.SEName, ''))) AS SEName,
                    ${sqlCseLeadJobCode('cse')} AS LeadJobCode
                FROM ConcernedSE cse
                LEFT JOIN Master_ConcernedSE ms
                  ON UPPER(LTRIM(RTRIM(ISNULL(ms.FullName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(cse.SEName, ''))))
                WHERE cse.RequestNo IN (${inParams.join(', ')})
                  ${safeDivision && safeDivision !== 'All'
                    ? `AND UPPER(LTRIM(RTRIM(ISNULL(ms.Department, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))`
                    : ''}
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
                    ${sqlCseLeadJobCode('cse')} AS LeadJobCode
                FROM ConcernedSE cse
                LEFT JOIN Master_ConcernedSE ms
                  ON UPPER(LTRIM(RTRIM(ISNULL(ms.FullName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(cse.SEName, ''))))
                WHERE cse.RequestNo IN (${inParams.join(', ')})
                  AND ${sqlCseAccountabilityYes('cse')}
                  AND ${sqlCseLeadJobCode('cse')} <> N''
                  ${safeDivision && safeDivision !== 'All'
                    ? `AND UPPER(LTRIM(RTRIM(ISNULL(ms.Department, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))`
                    : ''}
            `);
            concernSeAccountableMap = (accountableRowsRes.recordset || []).reduce((acc, row) => {
                const rn = String(row.RequestNo || '').trim();
                const ljc = String(row.LeadJobCode || '').trim().toUpperCase();
                const nm = String(row.SEName || '').trim();
                if (!rn || !ljc || !nm) return acc;
                acc.set(`${rn}|${ljc}`, nm);
                return acc;
            }, new Map());
        }

        const resolveTopJobConcernSe = (r) => {
            const rn = String(r.RequestNo || '').trim();
            const ljc = String(r.LeadJobCode || '').trim().toUpperCase();
            if (ljc && concernSeAccountableMap.has(`${rn}|${ljc}`)) {
                return concernSeAccountableMap.get(`${rn}|${ljc}`);
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
                JobValue: r.JobValue,
                WonGrossProfit: r.WonGrossProfit,
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
        const { year, company, division, role, quarter } = req.query;
        if (!year) return res.status(400).json({ error: 'Year is required' });

        const request = new sql.Request();

        // Sanitize inputs
        const safeYear = parseInt(year);
        const safeCompany = normalizeReportFilterValue(company);
        const safeDivision = normalizeReportFilterValue(division);
        const safeRole = normalizeReportFilterValue(role);
        const safeQuarter = (quarter && quarter !== 'All') ? String(quarter).trim() : null;
        let quarterNums = null;
        if (safeQuarter) quarterNums = parseInt(safeQuarter.replace('Q', ''));

        request.input('year', sql.Int, safeYear);
        if (safeQuarter) {
            request.input('quarterNums', sql.Int, quarterNums);
            request.input('quarterStrs', sql.NVarChar, safeQuarter);
        }

        const filterClause = appendSalesReportEnquiryFilters(req, request, safeCompany, safeDivision, safeRole);

        const effectiveSeForItemWise =
            (req.salesReportForceSeName && String(req.salesReportForceSeName).trim())
            || safeRole;

        // Determine Grouping
        let itemWiseGroupBy = 'mef.DepartmentName';
        let itemWiseSelect = 'mef.DepartmentName as ItemName';
        let itemWiseWhere = '';

        if (effectiveSeForItemWise) {
            itemWiseGroupBy = 'mef.ItemName';
            itemWiseSelect = 'mef.ItemName as ItemName';
        }

        if (safeDivision) {
            itemWiseWhere += ` AND mef.DepartmentName = @division `;
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
        if (safeCompany) {
            requestTarget.input('company', sql.NVarChar, safeCompany);
        }
        if (effectiveSeForItemWise) requestTarget.input('se', sql.NVarChar, effectiveSeForItemWise);

        let targetQuery = '';
        if (req.salesReportNonCcBlock === true) {
            targetQuery = `
                SELECT Division as Name, CAST(0 AS DECIMAL(18,2)) as Target
                FROM SalesTargets WHERE 1=0
            `;
        } else if (effectiveSeForItemWise) {
            targetQuery = `
                SELECT ItemName as Name, SUM(ISNULL(TargetValue, 0)) as Target
                FROM SalesTargets
                WHERE FinancialYear = @year AND SalesEngineer = @se
                ${safeCompany ? `AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefT
                    WHERE LTRIM(RTRIM(ISNULL(mefT.CompanyName, ''))) = LTRIM(RTRIM(ISNULL(@company, '')))
                      AND (
                        LTRIM(RTRIM(ISNULL(mefT.DepartmentName, ''))) = LTRIM(RTRIM(ISNULL(SalesTargets.Division, '')))
                        OR LTRIM(RTRIM(ISNULL(mefT.ItemName, ''))) = LTRIM(RTRIM(ISNULL(SalesTargets.Division, '')))
                      )
                ) ` : ''}
                ${safeQuarter ? 'AND Quarter = @quarterStr ' : ''}
                GROUP BY ItemName
            `;
        } else {
            if (safeDivision) {
                requestTarget.input('division', sql.NVarChar, safeDivision);
            }
            targetQuery = `
                SELECT Division as Name, SUM(ISNULL(TargetValue, 0)) as Target
                FROM SalesTargets
                WHERE FinancialYear = @year
                ${safeCompany ? `AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefT
                    WHERE LTRIM(RTRIM(ISNULL(mefT.CompanyName, ''))) = LTRIM(RTRIM(ISNULL(@company, '')))
                      AND (
                        LTRIM(RTRIM(ISNULL(mefT.DepartmentName, ''))) = LTRIM(RTRIM(ISNULL(SalesTargets.Division, '')))
                        OR LTRIM(RTRIM(ISNULL(mefT.ItemName, ''))) = LTRIM(RTRIM(ISNULL(SalesTargets.Division, '')))
                      )
                ) ` : ''}
                ${safeDivision ? 'AND Division = @division ' : ''}
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
        const { year, company, division, role, probabilityName, quarter } = req.query;
        if (!year || !probabilityName) return res.status(400).json({ error: 'Year and Probability Name are required' });

        const request = new sql.Request();
        request.input('year', sql.Int, year);
        request.input('probName', sql.NVarChar, probabilityName);

        const safeQuarter = (quarter && quarter !== 'All') ? String(quarter).trim() : null;
        let quarterNum = null;
        if (safeQuarter) {
            quarterNum = parseInt(safeQuarter.replace('Q', ''));
            request.input('quarterNum', sql.Int, quarterNum);
        }

        const safeCompanyFd = company ? String(company).trim() : null;
        const safeDivisionFd = division ? String(division).trim() : null;
        const safeRoleFd = role ? String(role).trim() : null;
        const filterClause = appendSalesReportEnquiryFilters(req, request, safeCompanyFd, safeDivisionFd, safeRoleFd);

        // Define required SQL snippets locally (these are not in scope from /summary)
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
        let localItemValueSQL = '';
        if (division && division !== 'All') {
            localItemValueSQL = `
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
                      AND LTRIM(RTRIM(MEF_Inner.DepartmentName)) = @division
                ) ItemValue
            `;
        } else {
            localItemValueSQL = `
                OUTER APPLY (
                    SELECT SUM(ISNULL(Price, 0)) as Total
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
        const localItemValueApply = localSelectedCustomerApply + localItemValueSQL;
        const localItemValueCol = 'ISNULL(ItemValue.Total, 0)';

        // 1. Fetch Enquiries
        const enquiriesRes = await request.query(`
            SELECT
                E.RequestNo,
                E.ProjectName,
                E.CustomerName,
                ${localItemValueCol} as TotalPrice,
                Q.QuoteRef,
                Q.QuoteDate
            FROM EnquiryMaster E
            ${localItemValueApply}
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

        if (division && division !== 'All') {
            jobsRequest.input('div', sql.NVarChar, division);
            jobWhere += ` 
                AND EXISTS (
                    SELECT 1 
                    FROM Master_EnquiryFor mef 
                    WHERE (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '%- ' + mef.ItemName OR EF.ItemName LIKE '%-' + mef.ItemName)
                    AND mef.DepartmentName = @div
                )
            `;
        }

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

            // Recalculate if Division filter is active
            if (division && division !== 'All') {
                // Sum up NetPrice of visible jobs to get Division Total
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

        // Sanitize inputs
        const safeYear = year ? parseInt(year) : null;
        const safeCompany = company ? String(company).trim() : null;
        const safeDivision = division ? String(division).trim() : null;
        const safeRole = role ? String(role).trim() : null;
        const safeLabel = label ? String(label).trim() : null;

        const request = new sql.Request();
        request.input('year', sql.Int, safeYear);
        if (safeLabel) request.input('label', sql.NVarChar, safeLabel);
        if (status) request.input('status', sql.NVarChar, status);

        const safeQuarter = (quarter && quarter !== 'All') ? String(quarter).trim() : null;
        let quarterNum = null;
        if (safeQuarter) {
            quarterNum = parseInt(safeQuarter.replace('Q', ''));
            request.input('quarterNum', sql.Int, quarterNum);
        }

        const filterClause = appendSalesReportEnquiryFilters(req, request, safeCompany, safeDivision, safeRole);

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
            if (role && role !== 'All') itemFilter = `(mef.ItemName = @label)`;
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

        if (division && division !== 'All') {
            jobsRequest.input('div', sql.NVarChar, division);
            jobWhere += ` 
                AND EXISTS (
                    SELECT 1 
                    FROM Master_EnquiryFor mef 
                    WHERE (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '%- ' + mef.ItemName OR EF.ItemName LIKE '%-' + mef.ItemName)
                    AND mef.DepartmentName = @div
                )
            `;
        }

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

        const { request, safeQuarter, safeCompany, safeDivision, nonCcBlock } = ctx;
        const effectiveQuotedSe = getSalesReportAssignedSe(req, ctx.safeRole);
        if (effectiveQuotedSe) {
            request.input('quotedSe', sql.NVarChar, effectiveQuotedSe);
        }
        let quotedFilterClause = '';
        if (nonCcBlock) {
            quotedFilterClause += ' AND 1=0 ';
        } else {
            if (safeCompany && safeCompany !== 'All') {
                quotedFilterClause += ` AND EXISTS (
                    SELECT 1
                    FROM EnquiryFor ef
                    JOIN Master_EnquiryFor mef
                      ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName)
                    WHERE ef.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(mef.CompanyName)) = @company
                ) `;
            }
            if (safeDivision && safeDivision !== 'All') {
                quotedFilterClause += ` AND EXISTS (
                    SELECT 1
                    FROM EnquiryFor ef
                    JOIN Master_EnquiryFor mef
                      ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName)
                    WHERE ef.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(mef.DepartmentName)) = @division
                ) `;
            }
            if (effectiveQuotedSe) {
                quotedFilterClause += ` AND EXISTS (
                    SELECT 1
                    FROM ConcernedSE cse
                    WHERE cse.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(ISNULL(cse.SEName, ''))) = LTRIM(RTRIM(ISNULL(@quotedSe, '')))
                ) `;
            }
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


