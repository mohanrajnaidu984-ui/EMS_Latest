const express = require('express');
const router = express.Router();
const { sql } = require('../dbConfig');
const runQuotedQuoteListQuery = require('../lib/quotedQuoteListQuery');
const mapQuoteListingRows = require('../lib/mapQuoteListingRows');

/** Avoid duplicate Master_ConcernedSE / Master_EnquiryFor hits on rapid dashboard + modal calls. */
const DASHBOARD_ACCESS_CACHE_MS = 90_000;
const dashboardAccessCache = new Map();

// Helper to construct filter clauses (kept for reference or future use if needed, though active logic is inline below)
// --- Helper: Apply Access Control Logic ---
const applyAccessControl = (request, params) => {
    const { userRole, userName, userEmail, accessMode } = params;

    // Logic: 
    // Tiered visibility policy (per user request):
    // - Admin/System: all
    // - Default: assigned enquiries only (ConcernedSE match)
    // - If email is in Master_EnquiryFor.CCMailIds: department enquiries (CC mail match) + assigned
    //
    // NOTE: CommonMailIds does NOT expand visibility (still assigned-only).

    // Identify if Admin or System role
    const userRoles = typeof userRole === 'string'
        ? userRole.split(',').map(r => r.trim().toLowerCase())
        : (Array.isArray(userRole) ? userRole.map(r => String(r).trim().toLowerCase()) : []);

    const isAdmin = userRoles.includes('admin') || userRoles.includes('system') || (userEmail && userEmail.toLowerCase() === 'ranigovardhan@gmail.com');

    if (isAdmin) return '';

    const mode = (accessMode || 'assigned').toString().toLowerCase();

    request.input('currentUserName', sql.NVarChar, userName || '');
    request.input('currentUserEmail', sql.NVarChar, userEmail || '');

    // Assigned enquiries only (ConcernedSE). If userName is missing, this will yield no rows (strict policy).
    const assignedFilter = `EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = @currentUserName)`;

    if (mode === 'department') {
        // Department enquiries = any enquiry whose divisions map to a master row where CCMailIds contains the user email.
        // (CommonMailIds does NOT grant access per the requested policy.)
        const ccFilter = `
            EXISTS (
                SELECT 1
                FROM EnquiryFor ef
                JOIN Master_EnquiryFor mef ON ef.ItemName = mef.ItemName
                WHERE ef.RequestNo = em.RequestNo
                  AND ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + @currentUserEmail + ',%'
            )
        `;
        return ` AND ( ${assignedFilter} OR ${ccFilter} ) `;
    }

    return ` AND ( ${assignedFilter} ) `;
};

function parseDashboardUserRoles(userRole) {
    const rs = userRole || '';
    if (typeof rs === 'string') {
        return rs.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
    }
    if (Array.isArray(rs)) {
        return rs.map((r) => String(r).trim().toLowerCase()).filter(Boolean);
    }
    return [];
}

function dashboardRoleIsAdmin(userRole) {
    const roles = parseDashboardUserRoles(userRole);
    return roles.includes('admin') || roles.includes('system');
}

async function resolveDashboardAccessMode(userEmail, userRole) {
    const email = (userEmail || '').toString().trim().toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
    if (!email) return { accessMode: 'assigned', fullName: '' };

    if (dashboardRoleIsAdmin(userRole)) {
        const userRes = await sql.query`
            SELECT TOP 1 FullName
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${email}
        `;
        const fullName = (userRes.recordset?.[0]?.FullName || '').toString().trim();
        return { accessMode: 'department', fullName };
    }

    const cacheKey = `${email}|${String(userRole || '').toLowerCase()}`;
    const now = Date.now();
    const cached = dashboardAccessCache.get(cacheKey);
    if (cached && now - cached.t < DASHBOARD_ACCESS_CACHE_MS) {
        return cached.v;
    }

    // Resolve FullName (for ConcernedSE match) and detect CC mail membership
    const [userRes, ccRes, mgmtRes] = await Promise.all([
        sql.query`
            SELECT TOP 1 FullName, Department
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${email}
        `,
        sql.query`
            SELECT TOP 1 1 AS ok
            FROM Master_EnquiryFor
            WHERE ',' + REPLACE(REPLACE(ISNULL(CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${`%,${email},%`}
        `,
        sql.query`
            SELECT TOP 1 1 AS ok
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${email}
              AND LOWER(LTRIM(RTRIM(ISNULL(Department, N'')))) = N'management'
        `
    ]);

    const fullName = (userRes.recordset?.[0]?.FullName || '').toString().trim();
    const isManagementDept = (mgmtRes.recordset?.length || 0) > 0;
    const isCcUser = (ccRes.recordset?.length || 0) > 0 || isManagementDept;
    const v = { accessMode: isCcUser ? 'department' : 'assigned', fullName };
    dashboardAccessCache.set(cacheKey, { t: now, v });
    return v;
}

/**
 * SQL fragment for EnquiryQuotes `eq` in FilteredQuotes / NOT EXISTS "has quote" checks.
 * - **Assigned (non–CC):** quote must be prepared by the logged-in user; if an SE is selected, also match that SE.
 * - **Department (CC):** do not require the CC user's name on the quote; filter by selected SE when not "All",
 *   otherwise include any quote that passes the division-code-on-QuoteNumber clause (added separately).
 */
function buildDashboardQuoteScopeFilter(isDeptMode, salesEngineer) {
    const se = salesEngineer && String(salesEngineer).trim() !== '' && String(salesEngineer).trim().toLowerCase() !== 'all';
    const seFrag = `
                AND (
                    UPPER(LTRIM(RTRIM(ISNULL(eq.PreparedBy, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@salesEngineer, ''))))
                    OR EXISTS (
                        SELECT 1
                        FROM Master_ConcernedSE mcs
                        WHERE UPPER(LTRIM(RTRIM(ISNULL(mcs.FullName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@salesEngineer, ''))))
                          AND LOWER(LTRIM(RTRIM(ISNULL(eq.PreparedByEmail, '')))) = LOWER(LTRIM(RTRIM(ISNULL(mcs.EmailId, ''))))
                    )
                )`;

    if (isDeptMode) {
        return se ? seFrag : '';
    }

    let q = `
            AND (
                NULLIF(LTRIM(RTRIM(ISNULL(@currentUserEmail, ''))), '') IS NULL
                OR LOWER(LTRIM(RTRIM(ISNULL(eq.PreparedByEmail, '')))) = LOWER(LTRIM(RTRIM(ISNULL(@currentUserEmail, ''))))
                OR UPPER(LTRIM(RTRIM(ISNULL(eq.PreparedBy, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@currentUserName, ''))))
            )`;
    if (se) q += seFrag;
    return q;
}

/** True when the enquiry has no row in EnquiryQuotes (any preparer — hides Due/Lapsed once any quote exists). */
const SQL_NO_QUOTE_FOR_ENQUIRY = (emAlias = 'em') =>
    `NOT EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = ${emAlias}.RequestNo)`;

/**
 * Division-aware "no quote" gate for Due/Lapsed.
 * When a division is selected, an enquiry remains Due/Lapsed until that division has a quote,
 * even if some other division on the same enquiry already quoted it.
 */
function buildDashboardNoQuoteSql(emAlias = 'em', division = '') {
    const div = String(division || '').trim();
    if (!div || div.toLowerCase() === 'all') {
        return SQL_NO_QUOTE_FOR_ENQUIRY(emAlias);
    }
    return `NOT EXISTS (
        SELECT 1
        FROM EnquiryQuotes eq
        WHERE eq.RequestNo = ${emAlias}.RequestNo
          AND EXISTS (
                SELECT 1
                FROM Master_EnquiryFor mefQ
                WHERE (
                    UPPER(LTRIM(RTRIM(ISNULL(mefQ.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                    OR UPPER(LTRIM(RTRIM(ISNULL(mefQ.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                )
                  AND LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, ''))) <> ''
                  AND (
                    CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                    OR CHARINDEX('-' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                    OR CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '-', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                  )
          )
    )`;
}

/** New vs revised quote filter for dashboard calendar chips (RevisionNo 0 = new, >0 = rev). */
function sqlQuoteRevisionFilterFromCalendarChip(calendarChip) {
    const chip = String(calendarChip || '').trim().toLowerCase();
    if (chip === 'newquote') return ' AND ISNULL(eq.RevisionNo, 0) = 0 ';
    if (chip === 'revquote') return ' AND ISNULL(eq.RevisionNo, 0) > 0 ';
    return '';
}

function fmtDashboardQuoteDetailDate(raw) {
    try {
        const dt = raw ? new Date(raw) : null;
        if (!dt || Number.isNaN(dt.getTime())) return '—';
        const d = dt.getDate();
        const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getMonth()];
        const y = dt.getFullYear();
        return `${String(d).padStart(2, '0')}-${mon}-${y}`;
    } catch {
        return '—';
    }
}

function extractLCodeFromLeadJobName(s) {
    const t = String(s || '').trim();
    if (!t) return '';
    const mParen = t.match(/\(([lL]\d+)\)\s*$/);
    if (mParen) return mParen[1].toUpperCase();
    const mStart = t.match(/^\s*([lL]\d+)\b/);
    if (mStart) return mStart[1].toUpperCase();
    const mAny = t.match(/\b([lL]\d+)\b/);
    if (mAny) return mAny[1].toUpperCase();
    return '';
}

function buildDashboardQuoteDetailLine(qt) {
    const toName = String(qt.ToName || '').trim();
    const ownJob = String(qt.OwnJob || '').trim();
    const lCode = extractLCodeFromLeadJobName(qt.LeadJob);
    let label;
    if (lCode && toName) label = `${toName} - ${lCode}`;
    else if (lCode && ownJob) label = `${ownJob} - ${lCode}`;
    else if (ownJob) label = ownJob;
    else label = toName || '—';
    const qn = String(qt.QuoteNumber || '').trim();
    const textLine = `${label} (${qn} - ${fmtDashboardQuoteDetailDate(qt.QuoteDate)})`;
    const ta = parseFloat(qt.TotalAmount);
    const quoteYmd = String(qt.QuoteYmd || '').trim() || null;
    return {
        textLine,
        quoteDate: qt.QuoteDate,
        quoteYmd,
        preparedBy: String(qt.PreparedBy || '').trim(),
        bdTotal: !Number.isNaN(ta) && ta > 0 ? ta : null,
        revisionNo: Number(qt.RevisionNo) || 0,
    };
}

/** Popup rows from EnquiryQuotes — same filters as GET /calendar quote chips (not quoted-list TotalAmount gate). */
async function fetchDashboardCalendarQuoteRows(request, { calendarEmBaseFilterSql, quoteScopeFilter, dateClause, revFilter }) {
    const sqlText = `
        SELECT
            em.RequestNo,
            em.ProjectName,
            em.ConsultantName,
            em.DueDate,
            eq.QuoteNumber,
            eq.QuoteDate,
            CONVERT(VARCHAR(10), eq.QuoteDate, 23) AS QuoteYmd,
            eq.RevisionNo,
            eq.TotalAmount,
            eq.PreparedBy,
            eq.OwnJob,
            eq.LeadJob,
            eq.ToName
        FROM EnquiryQuotes eq
        INNER JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
        WHERE 1=1
        ${calendarEmBaseFilterSql}
        ${quoteScopeFilter}
        ${dateClause}
        ${revFilter}
        ORDER BY em.DueDate ASC, em.RequestNo ASC, eq.RevisionNo ASC
    `;
    const result = await request.query(sqlText);
    const byReq = new Map();
    for (const r of result.recordset || []) {
        const req = String(r.RequestNo || '').trim();
        if (!req) continue;
        if (!byReq.has(req)) {
            byReq.set(req, {
                RequestNo: req,
                ProjectName: r.ProjectName,
                ConsultantName: r.ConsultantName,
                DueDate: r.DueDate,
                ListQuoteDetailLines: [],
            });
        }
        byReq.get(req).ListQuoteDetailLines.push(buildDashboardQuoteDetailLine(r));
    }
    return [...byReq.values()];
}

/** Local calendar "today" (YYYY-MM-DD) — optional client override to match dashboard cells. */
function getDashboardTodayYmd(query) {
    const raw = String(query?.today || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Monthly KPI totals = sum of daily grid (guarantees bar chart matches calendar chips). */
function reconcileCalendarTotalsFromDaily(daily, totalsFromSql) {
    const dailyRows = Array.isArray(daily) ? daily : [];
    const sum = (key) => dailyRows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
    return {
        enquiries: sum('Enquiries'),
        due: sum('Due'),
        lapsed: sum('Lapsed'),
        newQuote: sum('NewQuote'),
        revQuote: sum('RevQuote'),
        quoted: sum('NewQuote') + sum('RevQuote'),
        siteVisits: sum('SiteVisits'),
        _sqlTotals: totalsFromSql || null,
    };
}

/** Shared calendar filter SQL + parameter binding (matches legacy GET /calendar). */
function bindDashboardCalendarFilters(request, query, resolved) {
    const { division, salesEngineer, userEmail, userName, userRole } = query;
    const effectiveUserName = (resolved.fullName || userName || '').toString().trim();
    const isDeptMode = resolved.accessMode === 'department';

    let baseFilter = '';
    if (division && division !== 'All') {
        if (isDeptMode) {
            baseFilter += ` AND EXISTS (
                    SELECT 1
                    FROM EnquiryFor ef
                    JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
                    WHERE ef.RequestNo = em.RequestNo
                      AND mef.DepartmentName = @division
                ) `;
        } else {
            baseFilter += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef WHERE ef.RequestNo = em.RequestNo AND ef.ItemName = @division) `;
        }
        request.input('division', sql.NVarChar, division);
    }
    if (salesEngineer && salesEngineer !== 'All') {
        baseFilter += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = @salesEngineer) `;
        request.input('salesEngineer', sql.NVarChar, salesEngineer);
    }

    const accessFilter = applyAccessControl(request, {
        userRole,
        userName: effectiveUserName,
        userEmail,
        accessMode: resolved.accessMode,
    });
    baseFilter += accessFilter;

    let quoteScopeFilter = buildDashboardQuoteScopeFilter(isDeptMode, salesEngineer);
    if (division && division !== 'All') {
        quoteScopeFilter += `
                AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefQ
                    WHERE (
                        UPPER(LTRIM(RTRIM(ISNULL(mefQ.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                        OR UPPER(LTRIM(RTRIM(ISNULL(mefQ.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                    )
                      AND LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, ''))) <> ''
                      AND (
                        CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                        OR CHARINDEX('-' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                        OR CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '-', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                      )
                )
            `;
    }

    const todayStr = getDashboardTodayYmd(query);
    request.input('today', sql.VarChar(10), todayStr);

    return { baseFilter, quoteScopeFilter, todayStr };
}

/** Daily grid + monthly totals in one DB round-trip (two result sets). */
function buildDashboardCalendarMergedBatchSql(baseFilter, quoteScopeFilter, division = '') {
    const dueNoQuoteSql = buildDashboardNoQuoteSql('fe', division);
    const dailyPart = `
            WITH FilteredEnquiries AS (
                SELECT RequestNo, EnquiryDate, DueDate, SiteVisitDate, Status 
                FROM EnquiryMaster em
                WHERE 1=1 ${baseFilter}
            ),
            FilteredQuotes AS (
                SELECT eq.CreatedAt, eq.UpdatedAt, eq.QuoteDate, eq.RequestNo
                FROM EnquiryQuotes eq
                JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
                WHERE 1=1 ${baseFilter} ${quoteScopeFilter}
            ),
            Dates AS (
                SELECT EnquiryDate as DateVal, 'Enquiry' as Type FROM FilteredEnquiries WHERE MONTH(EnquiryDate) = @month AND YEAR(EnquiryDate) = @year
                UNION ALL
                SELECT fe.DueDate as DateVal, 'Due' as Type
                FROM FilteredEnquiries fe
                WHERE MONTH(fe.DueDate) = @month AND YEAR(fe.DueDate) = @year
                  AND CAST(fe.DueDate AS DATE) >= CAST(@today AS DATE)
                  AND ${dueNoQuoteSql}
                UNION ALL
                SELECT fe.DueDate as DateVal, 'Lapsed' as Type 
                FROM FilteredEnquiries fe
                WHERE MONTH(fe.DueDate) = @month AND YEAR(fe.DueDate) = @year
                AND CAST(fe.DueDate AS DATE) < CAST(@today AS DATE)
                AND ${dueNoQuoteSql}
                UNION ALL
                SELECT SiteVisitDate as DateVal, 'SiteVisit' as Type FROM FilteredEnquiries WHERE MONTH(SiteVisitDate) = @month AND YEAR(SiteVisitDate) = @year
                UNION ALL
                SELECT CAST(eq.QuoteDate AS DATE) AS DateVal,
                    CASE WHEN ISNULL(eq.RevisionNo, 0) = 0 THEN 'NewQuote' ELSE 'RevQuote' END AS Type
                FROM EnquiryQuotes eq
                JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
                WHERE 1=1 ${baseFilter} ${quoteScopeFilter}
                  AND eq.QuoteDate IS NOT NULL
                  AND MONTH(eq.QuoteDate) = @month AND YEAR(eq.QuoteDate) = @year
            )
            SELECT 
                CONVERT(VARCHAR(10), DateVal, 23) as Date,
                SUM(CASE WHEN Type = 'Enquiry' THEN 1 ELSE 0 END) as Enquiries,
                SUM(CASE WHEN Type = 'Due' THEN 1 ELSE 0 END) as Due,
                SUM(CASE WHEN Type = 'Lapsed' THEN 1 ELSE 0 END) as Lapsed,
                SUM(CASE WHEN Type = 'SiteVisit' THEN 1 ELSE 0 END) as SiteVisits,
                SUM(CASE WHEN Type = 'NewQuote' THEN 1 ELSE 0 END) as NewQuote,
                SUM(CASE WHEN Type = 'RevQuote' THEN 1 ELSE 0 END) as RevQuote,
                SUM(CASE WHEN Type IN ('NewQuote', 'RevQuote') THEN 1 ELSE 0 END) as Quoted
            FROM Dates
            WHERE DateVal IS NOT NULL
            GROUP BY CONVERT(VARCHAR(10), DateVal, 23)`;

    const totalsPart = `
            WITH FilteredEnquiries AS (
                SELECT RequestNo, EnquiryDate, DueDate, SiteVisitDate, Status 
                FROM EnquiryMaster em
                WHERE 1=1 ${baseFilter}
            ),
            FilteredQuotes AS (
                SELECT eq.CreatedAt, eq.UpdatedAt, eq.QuoteDate, eq.RequestNo
                FROM EnquiryQuotes eq
                JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
                WHERE 1=1 ${baseFilter} ${quoteScopeFilter}
            )
            SELECT 
                (SELECT COUNT(DISTINCT RequestNo) FROM FilteredEnquiries WHERE MONTH(EnquiryDate) = @month AND YEAR(EnquiryDate) = @year) as enquiries,
                (SELECT COUNT(DISTINCT fe.RequestNo)
                 FROM FilteredEnquiries fe
                 WHERE MONTH(fe.DueDate) = @month AND YEAR(fe.DueDate) = @year
                   AND CAST(fe.DueDate AS DATE) >= CAST(@today AS DATE)
                   AND ${dueNoQuoteSql}) as due,
                (SELECT COUNT(DISTINCT fe.RequestNo)
                 FROM FilteredEnquiries fe
                 WHERE MONTH(fe.DueDate) = @month AND YEAR(fe.DueDate) = @year
                   AND CAST(fe.DueDate AS DATE) < CAST(@today AS DATE)
                   AND ${dueNoQuoteSql}) as lapsed,
                (SELECT COUNT(*)
                 FROM EnquiryQuotes eq
                 JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
                 WHERE 1=1 ${baseFilter} ${quoteScopeFilter}
                   AND eq.QuoteDate IS NOT NULL
                   AND MONTH(eq.QuoteDate) = @month AND YEAR(eq.QuoteDate) = @year
                   AND ISNULL(eq.RevisionNo, 0) = 0) as newQuoted,
                (SELECT COUNT(*)
                 FROM EnquiryQuotes eq
                 JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
                 WHERE 1=1 ${baseFilter} ${quoteScopeFilter}
                   AND eq.QuoteDate IS NOT NULL
                   AND MONTH(eq.QuoteDate) = @month AND YEAR(eq.QuoteDate) = @year
                   AND ISNULL(eq.RevisionNo, 0) > 0) as revQuoted,
                (SELECT COUNT(*)
                 FROM EnquiryQuotes eq
                 JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
                 WHERE 1=1 ${baseFilter} ${quoteScopeFilter}
                   AND eq.QuoteDate IS NOT NULL
                   AND MONTH(eq.QuoteDate) = @month AND YEAR(eq.QuoteDate) = @year) as quoted`;

    return `${dailyPart} ; ${totalsPart}`;
}

function splitDashboardCalendarBatchResult(result) {
    const rss = result.recordsets;
    if (Array.isArray(rss) && rss.length >= 2) {
        const daily = rss[0] || [];
        const sqlTotals = rss[1] && rss[1][0] ? rss[1][0] : null;
        return { daily, totals: reconcileCalendarTotalsFromDaily(daily, sqlTotals) };
    }
    const daily = result.recordset || [];
    return { daily, totals: reconcileCalendarTotalsFromDaily(daily, null) };
}

async function runDashboardCalendarMonthQuery(reqQuery, month, year) {
    const resolved = await resolveDashboardAccessMode(reqQuery.userEmail, reqQuery.userRole);
    const request = new sql.Request();
    const { baseFilter, quoteScopeFilter } = bindDashboardCalendarFilters(request, reqQuery, resolved);
    request.input('month', sql.Int, parseInt(month, 10));
    request.input('year', sql.Int, parseInt(year, 10));
    const result = await request.query(
        buildDashboardCalendarMergedBatchSql(baseFilter, quoteScopeFilter, reqQuery.division)
    );
    return splitDashboardCalendarBatchResult(result);
}

/**
 * Builds WHERE clause and sql.Request inputs shared by GET /enquiries and GET /quote-summary-rows.
 * @param {import('express').Request} req
 * @param {{ restrictSingleDayToQuoteActivity?: boolean }} [options] When true and `date` is set, only enquiries with a scoped quote on that day (matches calendar quote chip), not enquiry/due/site rows.
 */
async function buildDashboardEnquiryListWhere(req, options = {}) {
    const { restrictSingleDayToQuoteActivity = false } = options;
    const { division, salesEngineer, date, fromDate, toDate, status, dateType, search, userEmail, userName, userRole } = req.query;
    const request = new sql.Request();

    let whereClause = ' WHERE 1=1 ';

    const resolved = await resolveDashboardAccessMode(userEmail, userRole);
    const effectiveUserName = (resolved.fullName || userName || '').toString().trim();
    const isDeptMode = resolved.accessMode === 'department';
    const accessSql = applyAccessControl(request, {
        userRole,
        userName: effectiveUserName,
        userEmail,
        accessMode: resolved.accessMode,
    });
    whereClause += accessSql;

    const isSearchActive = search && search.trim().length > 0;
    const enforceDivisionOnSearch =
        req.query.enforceDivision === '1' || String(req.query.enforceDivision || '').toLowerCase() === 'true';

    let divisionSql = '';
    let seSql = '';
    if (division && division !== 'All' && (!isSearchActive || enforceDivisionOnSearch)) {
        if (enforceDivisionOnSearch || isDeptMode) {
            // Do not use LIKE '%' + DepartmentName + '%' — "BMS Project" wrongly matches "IBMS Project".
            divisionSql = ` AND EXISTS (
                    SELECT 1
                    FROM EnquiryFor ef
                    LEFT JOIN Master_EnquiryFor mef ON (
                        ef.ItemName = mef.ItemName OR
                        ef.ItemName LIKE '% - ' + mef.ItemName OR
                        ef.ItemName LIKE '%- ' + mef.ItemName OR
                        ef.ItemName LIKE mef.ItemName + ' %'
                    )
                    WHERE ef.RequestNo = em.RequestNo
                      AND (
                        LTRIM(RTRIM(ISNULL(mef.DepartmentName, N''))) = LTRIM(RTRIM(@division))
                        OR LTRIM(RTRIM(ISNULL(ef.ItemName, N''))) = LTRIM(RTRIM(@division))
                      )
                ) `;
        } else {
            divisionSql = ` AND EXISTS (SELECT 1 FROM EnquiryFor ef WHERE ef.RequestNo = em.RequestNo AND ef.ItemName = @division) `;
        }
        whereClause += divisionSql;
        request.input('division', sql.NVarChar, division);
    }
    if (salesEngineer && salesEngineer !== 'All' && !isSearchActive) {
        seSql = ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = @salesEngineer) `;
        whereClause += seSql;
        request.input('salesEngineer', sql.NVarChar, salesEngineer);
    }

    /** Same enquiry visibility as GET /calendar quoted totals (division + SE + access on `em`). Omit when search bypasses those filters. */
    const calendarEmBaseFilterSql = isSearchActive ? null : `${divisionSql}${seSql}${accessSql}`;

    const seForQuoteScope = isSearchActive ? 'All' : salesEngineer;
    let quoteScopeFilter = buildDashboardQuoteScopeFilter(isDeptMode, seForQuoteScope);
    if (division && division !== 'All' && !isSearchActive) {
        quoteScopeFilter += `
                AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefQ
                    WHERE (
                        UPPER(LTRIM(RTRIM(ISNULL(mefQ.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                        OR UPPER(LTRIM(RTRIM(ISNULL(mefQ.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                    )
                      AND LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, ''))) <> ''
                      AND (
                        CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                        OR CHARINDEX('-' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                        OR CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '-', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                      )
                )
            `;
    }
    const todayStr = getDashboardTodayYmd(req.query);
    request.input('today', sql.VarChar(10), todayStr);
    const noQuoteSql = buildDashboardNoQuoteSql('em', division);

    if (status === 'Lapsed' && !isSearchActive) {
        whereClause += ` AND CONVERT(VARCHAR(10), em.DueDate, 23) < CONVERT(VARCHAR(10), @today, 23) AND ${noQuoteSql} `;
    } else if (status && status !== 'All' && !isSearchActive) {
        whereClause += ` AND em.Status = @status `;
        request.input('status', sql.NVarChar, status);
    }

    if (fromDate && toDate) {
        const type = dateType || 'Enquiry Date';

        if (type === 'Due Date') {
            whereClause += ` AND CONVERT(VARCHAR(10), em.DueDate, 23) BETWEEN CONVERT(VARCHAR(10), @fromDate, 23) AND CONVERT(VARCHAR(10), @toDate, 23) `;
            whereClause += ` AND ${noQuoteSql} `;
            // Open due (matches calendar chips): today/future only; Lapsed uses status=Lapsed + < today below.
            if (String(status || '').trim().toLowerCase() !== 'lapsed') {
                whereClause += ` AND CAST(em.DueDate AS DATE) >= CAST(@today AS DATE) `;
            }
        } else if (type === 'Quote Date') {
            const revFilter = sqlQuoteRevisionFilterFromCalendarChip(req.query.calendarChip);
            whereClause += ` AND EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) BETWEEN CONVERT(VARCHAR(10), @fromDate, 23) AND CONVERT(VARCHAR(10), @toDate, 23) ${revFilter} ${quoteScopeFilter}) `;
        } else {
            whereClause += ` AND CONVERT(VARCHAR(10), em.EnquiryDate, 23) BETWEEN CONVERT(VARCHAR(10), @fromDate, 23) AND CONVERT(VARCHAR(10), @toDate, 23) `;
        }

        request.input('fromDate', sql.VarChar(10), fromDate);
        request.input('toDate', sql.VarChar(10), toDate);
    } else if (date) {
        const calendarChip = (req.query.calendarChip || '').toString().trim().toLowerCase();
        const narrowChip =
            calendarChip &&
            ['enquiry', 'due', 'lapsed', 'visit', 'quote', 'newquote', 'revquote'].includes(calendarChip);

        if (restrictSingleDayToQuoteActivity) {
            const revFilter = sqlQuoteRevisionFilterFromCalendarChip(calendarChip);
            whereClause += ` AND EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) ${revFilter} ${quoteScopeFilter}) `;
            request.input('date', sql.VarChar(10), date);
        } else if (narrowChip) {
            request.input('date', sql.VarChar(10), date);
            if (calendarChip === 'enquiry') {
                whereClause += ` AND CONVERT(VARCHAR(10), em.EnquiryDate, 23) = CONVERT(VARCHAR(10), @date, 23) `;
            } else if (calendarChip === 'due') {
                whereClause += ` AND CONVERT(VARCHAR(10), em.DueDate, 23) = CONVERT(VARCHAR(10), @date, 23)
                    AND CAST(em.DueDate AS DATE) >= CAST(@today AS DATE)
                    AND ${noQuoteSql} `;
            } else if (calendarChip === 'lapsed') {
                whereClause += ` AND CONVERT(VARCHAR(10), em.DueDate, 23) = CONVERT(VARCHAR(10), @date, 23)
                    AND CAST(em.DueDate AS DATE) < CAST(@today AS DATE)
                    AND ${noQuoteSql} `;
            } else if (calendarChip === 'visit') {
                whereClause += ` AND CONVERT(VARCHAR(10), em.SiteVisitDate, 23) = CONVERT(VARCHAR(10), @date, 23) `;
            } else if (calendarChip === 'newquote') {
                whereClause += ` AND EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) AND ISNULL(eq.RevisionNo, 0) = 0 ${quoteScopeFilter}) `;
            } else if (calendarChip === 'revquote') {
                whereClause += ` AND EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) AND ISNULL(eq.RevisionNo, 0) > 0 ${quoteScopeFilter}) `;
            } else if (calendarChip === 'quote') {
                whereClause += ` AND EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) ${quoteScopeFilter}) `;
            }
        } else {
            whereClause += ` AND (
                CONVERT(VARCHAR(10), em.EnquiryDate, 23) = CONVERT(VARCHAR(10), @date, 23) OR
                CONVERT(VARCHAR(10), em.DueDate, 23) = CONVERT(VARCHAR(10), @date, 23) OR
                CONVERT(VARCHAR(10), em.SiteVisitDate, 23) = CONVERT(VARCHAR(10), @date, 23) OR
                EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) ${quoteScopeFilter})
            ) `;
            request.input('date', sql.VarChar(10), date);
        }
    }

    if (!fromDate && !toDate && !date && !isSearchActive) {
        const currentMode = req.query.mode || 'future';

        if (currentMode === 'today') {
            whereClause += ` AND (
                    CONVERT(VARCHAR(10), em.DueDate, 23) = CONVERT(VARCHAR(10), @today, 23) OR
                    CONVERT(VARCHAR(10), em.SiteVisitDate, 23) = CONVERT(VARCHAR(10), @today, 23)
                ) `;
            whereClause += ` AND ${noQuoteSql} `;
        } else if (currentMode === 'future') {
            whereClause += ` AND CONVERT(VARCHAR(10), em.DueDate, 23) >= CONVERT(VARCHAR(10), @today, 23) `;
            whereClause += ` AND ${noQuoteSql} `;
        }
    }

    if (isSearchActive) {
        whereClause += ` AND (
                em.ProjectName LIKE @search OR
                em.CustomerName LIKE @search OR
                em.RequestNo LIKE @search OR
                em.ClientName LIKE @search OR
                em.ConsultantName LIKE @search OR
                em.EnquiryDetails LIKE @search OR
                EXISTS (SELECT 1 FROM EnquiryFor ef WHERE ef.RequestNo = em.RequestNo AND ef.ItemName LIKE @search) OR
                EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName LIKE @search)
            ) `;
        request.input('search', sql.NVarChar, `%${search}%`);
    }

    let scopedQuoteCountDateClause = '';
    if (!isSearchActive) {
        if (fromDate && toDate) {
            const dtLabel = (dateType || 'Enquiry Date').toString();
            if (dtLabel === 'Quote Date' || dtLabel === 'Quote date') {
                scopedQuoteCountDateClause = ` AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) BETWEEN CONVERT(VARCHAR(10), @fromDate, 23) AND CONVERT(VARCHAR(10), @toDate, 23) `;
            }
        } else if (date) {
            scopedQuoteCountDateClause = ` AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) `;
        }
    }

    const divisionTrim = division && division !== 'All' ? String(division).trim() : '';
    const userEmailForAccess = (userEmail || '').toString().trim();

    return {
        request,
        whereClause,
        isSearchActive,
        quoteScopeFilter,
        scopedQuoteCountDateClause,
        divisionTrim,
        userEmailForAccess,
        calendarEmBaseFilterSql,
    };
}

// 1. Calendar Aggregation (single month; one merged SQL batch)
router.get('/calendar', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { month, year } = req.query;
        if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });
        const { daily, totals } = await runDashboardCalendarMonthQuery(req.query, month, year);
        res.json({ daily, totals });
    } catch (err) {
        console.error('Calendar API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/** Last N calendar months ending at anchor month (inclusive), oldest → newest. */
function dashboardMonthsEndingAt(anchorMonth, anchorYear, count) {
    const n = Math.min(Math.max(parseInt(count, 10) || 12, 1), 24);
    let m = parseInt(anchorMonth, 10);
    let y = parseInt(anchorYear, 10);
    const out = [];
    for (let i = 0; i < n; i++) {
        out.unshift({ month: m, year: y });
        m -= 1;
        if (m < 1) {
            m = 12;
            y -= 1;
        }
    }
    return out;
}

/** Next N calendar months after anchor month (exclusive of anchor). */
function dashboardMonthsAfterAnchor(anchorMonth, anchorYear, count) {
    const n = Math.min(Math.max(parseInt(count, 10) || 0, 0), 6);
    let m = parseInt(anchorMonth, 10);
    let y = parseInt(anchorYear, 10);
    const out = [];
    for (let i = 0; i < n; i++) {
        m += 1;
        if (m > 12) {
            m = 1;
            y += 1;
        }
        out.push({ month: m, year: y });
    }
    return out;
}

/** Past months ending at anchor + optional future months (oldest → newest). */
function dashboardMonthsHistoryRange(anchorMonth, anchorYear, pastCount, futureCount) {
    const past = dashboardMonthsEndingAt(anchorMonth, anchorYear, pastCount);
    const future = dashboardMonthsAfterAnchor(anchorMonth, anchorYear, futureCount);
    return [...past, ...future];
}

function dashboardMonthPayloadKey(year, month) {
    return `${year}-${month}`;
}

/** Sum calendar KPI totals for all 12 months in a calendar year. */
function sumDashboardYearTotals(monthPayloadByKey, year) {
    const y = parseInt(year, 10);
    const totals = { enquiries: 0, due: 0, lapsed: 0, newQuote: 0, revQuote: 0 };
    for (let m = 1; m <= 12; m++) {
        const payload = monthPayloadByKey.get(dashboardMonthPayloadKey(y, m));
        if (!payload) continue;
        const t = payload.totals || reconcileCalendarTotalsFromDaily(payload.daily, null);
        totals.enquiries += Number(t.enquiries) || 0;
        totals.due += Number(t.due) || 0;
        totals.lapsed += Number(t.lapsed) || 0;
        totals.newQuote += Number(t.newQuote) || 0;
        totals.revQuote += Number(t.revQuote) || 0;
    }
    return totals;
}

/** Monthly overview history for dashboard right panel (default: 12 past + 2 future from anchor). */
router.get('/calendars-history', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { anchorMonth, anchorYear, count, futureCount } = req.query;
        if (!anchorMonth || !anchorYear) {
            return res.status(400).json({ error: 'anchorMonth and anchorYear are required' });
        }
        const monthList = dashboardMonthsHistoryRange(
            anchorMonth,
            anchorYear,
            count,
            futureCount,
        );
        const resolved = await resolveDashboardAccessMode(req.query.userEmail, req.query.userRole);

        const runOne = async (m, y) => {
            const request = new sql.Request();
            const { baseFilter, quoteScopeFilter } = bindDashboardCalendarFilters(request, req.query, resolved);
            request.input('month', sql.Int, parseInt(m, 10));
            request.input('year', sql.Int, parseInt(y, 10));
            const result = await request.query(
                buildDashboardCalendarMergedBatchSql(baseFilter, quoteScopeFilter, req.query.division)
            );
            return splitDashboardCalendarBatchResult(result);
        };

        const payloads = await Promise.all(monthList.map(({ month, year }) => runOne(month, year)));
        const monthPayloadByKey = new Map();
        monthList.forEach((meta, idx) => {
            monthPayloadByKey.set(dashboardMonthPayloadKey(meta.year, meta.month), payloads[idx]);
        });

        const anchorY = parseInt(anchorYear, 10);
        const missingYearMonths = [];
        for (let m = 1; m <= 12; m++) {
            const key = dashboardMonthPayloadKey(anchorY, m);
            if (!monthPayloadByKey.has(key)) {
                missingYearMonths.push({ month: m, year: anchorY });
            }
        }
        if (missingYearMonths.length > 0) {
            const extraPayloads = await Promise.all(
                missingYearMonths.map(({ month, year }) => runOne(month, year)),
            );
            missingYearMonths.forEach((meta, idx) => {
                monthPayloadByKey.set(
                    dashboardMonthPayloadKey(meta.year, meta.month),
                    extraPayloads[idx],
                );
            });
        }

        const yearTotals = sumDashboardYearTotals(monthPayloadByKey, anchorY);

        res.json({
            anchorMonth: parseInt(anchorMonth, 10),
            anchorYear: anchorY,
            yearTotals,
            months: monthList.map((meta, idx) => ({
                month: meta.month,
                year: meta.year,
                daily: payloads[idx].daily,
                totals: payloads[idx].totals,
            })),
        });
    } catch (err) {
        console.error('Calendar history API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/** Two dashboard months in one HTTP call: one access resolve + two merged calendar batches in parallel. */
router.get('/calendars-pair', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { leftMonth, leftYear, rightMonth, rightYear } = req.query;
        if (!leftMonth || !leftYear || !rightMonth || !rightYear) {
            return res.status(400).json({ error: 'leftMonth, leftYear, rightMonth, and rightYear are required' });
        }
        const resolved = await resolveDashboardAccessMode(req.query.userEmail, req.query.userRole);

        const runOne = async (m, y) => {
            const request = new sql.Request();
            const { baseFilter, quoteScopeFilter } = bindDashboardCalendarFilters(request, req.query, resolved);
            request.input('month', sql.Int, parseInt(m, 10));
            request.input('year', sql.Int, parseInt(y, 10));
            const result = await request.query(
                buildDashboardCalendarMergedBatchSql(baseFilter, quoteScopeFilter, req.query.division)
            );
            return splitDashboardCalendarBatchResult(result);
        };

        const [left, right] = await Promise.all([runOne(leftMonth, leftYear), runOne(rightMonth, rightYear)]);
        res.json({ left, right });
    } catch (err) {
        console.error('Calendar pair API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. KPISummary
router.get('/summary', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { division, salesEngineer, userEmail, userName, userRole } = req.query;
        const request = new sql.Request();

        let baseFilter = '';
        const resolved = await resolveDashboardAccessMode(userEmail, userRole);
        const effectiveUserName = (resolved.fullName || userName || '').toString().trim();
        const isDeptMode = resolved.accessMode === 'department';

        if (division && division !== 'All') {
            if (isDeptMode) {
                baseFilter += ` AND EXISTS (
                    SELECT 1
                    FROM EnquiryFor ef
                    JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
                    WHERE ef.RequestNo = em.RequestNo
                      AND mef.DepartmentName = @division
                ) `;
            } else {
                baseFilter += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef WHERE ef.RequestNo = em.RequestNo AND ef.ItemName = @division) `;
            }
            request.input('division', sql.NVarChar, division);
        }
        if (salesEngineer && salesEngineer !== 'All') {
            baseFilter += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = @salesEngineer) `;
            request.input('salesEngineer', sql.NVarChar, salesEngineer);
        }

        // Apply Access Control
        baseFilter += applyAccessControl(request, { userRole, userName: effectiveUserName, userEmail, accessMode: resolved.accessMode });
        let quoteScopeFilter = buildDashboardQuoteScopeFilter(isDeptMode, salesEngineer);
        if (division && division !== 'All') {
            quoteScopeFilter += `
                AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefQ
                    WHERE (
                        UPPER(LTRIM(RTRIM(ISNULL(mefQ.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                        OR UPPER(LTRIM(RTRIM(ISNULL(mefQ.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                    )
                      AND LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, ''))) <> ''
                      AND (
                        CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                        OR CHARINDEX('-' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                        OR CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '-', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                      )
                )
            `;
        }
        const noQuoteSql = buildDashboardNoQuoteSql('em', division);

        const today = new Date();
        const query = `
            SELECT
                (SELECT COUNT(*) FROM EnquiryMaster em WHERE CONVERT(VARCHAR(10), EnquiryDate, 23) = CONVERT(VARCHAR(10), @today, 23) ${baseFilter}) as EnquiriesToday,
                (SELECT COUNT(*) FROM EnquiryMaster em
                 WHERE CONVERT(VARCHAR(10), DueDate, 23) = CONVERT(VARCHAR(10), @today, 23)
                   AND ${noQuoteSql}
                   ${baseFilter}) as DueToday,
                (SELECT COUNT(*) FROM EnquiryMaster em
                 WHERE CONVERT(VARCHAR(10), DueDate, 23) > CONVERT(VARCHAR(10), @today, 23)
                   AND ${noQuoteSql}
                   ${baseFilter}) as UpcomingDues,
                (SELECT COUNT(*) FROM EnquiryMaster em WHERE Status IN ('Quoted', 'Quote', 'Submitted') ${baseFilter}) as QuotedCount,
                (SELECT COUNT(*) FROM EnquiryMaster em
                 WHERE CONVERT(VARCHAR(10), DueDate, 23) < CONVERT(VARCHAR(10), @today, 23)
                   AND ${noQuoteSql}
                   ${baseFilter}) as LapsedCount
        `;

        const todayStr = getDashboardTodayYmd(req.query);
        request.input('today', sql.VarChar(10), todayStr);
        const result = await request.query(query);
        res.json(result.recordset[0]);

    } catch (err) {
        console.error('Summary API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/** Quote module–style summary rows for dashboard “Quoted” bar / quote chip (same mapper as /api/quotes/list/*). */
router.get('/quote-summary-rows', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { fromDate, toDate, date, dateType } = req.query;
        const dtLabel = (dateType || 'Enquiry Date').toString();
        const isQuoteMonth = fromDate && toDate && (dtLabel === 'Quote Date' || dtLabel === 'Quote date');
        const isQuoteDay = !!date;
        if (!isQuoteMonth && !isQuoteDay) {
            return res.json({ rows: [], calendarQuotedCount: null });
        }

        const ctx = await buildDashboardEnquiryListWhere(req, {
            restrictSingleDayToQuoteActivity: isQuoteDay,
        });
        const { request, whereClause, divisionTrim, userEmailForAccess, calendarEmBaseFilterSql, quoteScopeFilter, isSearchActive } =
            ctx;

        if (!userEmailForAccess) {
            return res.json({ rows: [], calendarQuotedCount: null });
        }

        const revFilter = sqlQuoteRevisionFilterFromCalendarChip(req.query.calendarChip);
        let dateClause = '';
        if (isQuoteMonth) {
            dateClause = ` AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) BETWEEN CONVERT(VARCHAR(10), @fromDate, 23) AND CONVERT(VARCHAR(10), @toDate, 23) `;
        } else if (isQuoteDay) {
            dateClause = ` AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) `;
        }

        /** Match GET /calendar quoted total: COUNT(EnquiryQuotes rows), not UI lead lines. */
        let calendarQuotedCount = null;
        if (!isSearchActive && calendarEmBaseFilterSql != null && dateClause) {
            const countSql = `
                SELECT COUNT(*) AS cnt
                FROM EnquiryQuotes eq
                INNER JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
                WHERE 1=1
                ${calendarEmBaseFilterSql}
                ${quoteScopeFilter}
                ${dateClause}
                ${revFilter}
            `;
            const countRes = await request.query(countSql);
            calendarQuotedCount = Number(countRes.recordset[0]?.cnt) || 0;
        }

        if (!isSearchActive && calendarEmBaseFilterSql != null && dateClause) {
            const rows = await fetchDashboardCalendarQuoteRows(request, {
                calendarEmBaseFilterSql,
                quoteScopeFilter,
                dateClause,
                revFilter,
            });
            return res.json({ rows, calendarQuotedCount });
        }

        const idsQuery = `SELECT DISTINCT em.RequestNo FROM EnquiryMaster em ${whereClause}`;
        const idRes = await request.query(idsQuery);
        const ids = (idRes.recordset || []).map((r) => String(r.RequestNo ?? '').trim()).filter(Boolean);
        if (ids.length === 0) {
            return res.json({ rows: [], calendarQuotedCount });
        }

        const esc = (s) => String(s).replace(/'/g, "''");
        const inCsv = ids.map((id) => `'${esc(id)}'`).join(', ');
        const extraWhereSql = ` AND E.RequestNo IN (${inCsv}) `;

        const { enquiries: rawQuoted, accessCtx, userEmail: ue } = await runQuotedQuoteListQuery(
            sql,
            userEmailForAccess,
            extraWhereSql,
            divisionTrim,
            { requirePositiveAmount: false }
        );
        const mapped = await mapQuoteListingRows(sql, rawQuoted || [], ue, accessCtx, divisionTrim);
        const sorted = [...mapped].sort((a, b) => {
            const ta = a.DueDate ? new Date(a.DueDate).getTime() : 0;
            const tb = b.DueDate ? new Date(b.DueDate).getTime() : 0;
            return ta - tb;
        });

        res.json({ rows: sorted, calendarQuotedCount });
    } catch (err) {
        console.error('Dashboard quote-summary-rows Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3. Enquiry Table
router.get('/enquiries', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { date, userEmail, userName, userRole, division, salesEngineer, fromDate, toDate, status, dateType, search } = req.query;

        const {
            request,
            whereClause,
            quoteScopeFilter,
            scopedQuoteCountDateClause,
        } = await buildDashboardEnquiryListWhere(req, {});

        // Input for User Preference Logic (Renamed to avoid conflict with applyAccessControl)
        request.input('queryUserEmail', sql.NVarChar, userEmail || '');

        const query = `
            SELECT 
                em.RequestNo,
                em.ProjectName,
                em.CustomerName,
                em.ClientName,
                em.ConsultantName,
                CONVERT(VARCHAR(10), em.DueDate, 23) as DueDate,
                CONVERT(VARCHAR(10), em.SiteVisitDate, 23) as SiteVisitDate,
                em.EnquiryDetails,
                CONVERT(VARCHAR(10), em.EnquiryDate, 23) as EnquiryDate,
                em.Status,
                em.ReceivedFrom,
                CASE WHEN EXISTS (
                    SELECT 1 FROM EnquiryQuotes eq
                    WHERE eq.RequestNo = em.RequestNo
                    ${quoteScopeFilter}
                ) THEN 1 ELSE 0 END AS HasQuoteInScope,
                CASE WHEN EXISTS (
                    SELECT 1 FROM EnquiryQuotes eq
                    WHERE eq.RequestNo = em.RequestNo
                ) THEN 1 ELSE 0 END AS HasQuoteAny,
                (SELECT COUNT(*) FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo ${quoteScopeFilter}${scopedQuoteCountDateClause}) AS ScopedQuotesCount,
                NULLIF(STUFF((SELECT ', ' + et.TypeName FROM EnquiryType et WHERE et.RequestNo = em.RequestNo FOR XML PATH('')), 1, 2, ''), '') AS EnquiryType,
                em.SourceOfEnquiry AS SourceOfInfo,
                STUFF((SELECT ', ' + SEName FROM ConcernedSE WHERE RequestNo = em.RequestNo FOR XML PATH('')), 1, 2, '') as ConcernedSE,
                STUFF((SELECT ', ' + ItemName FROM EnquiryFor WHERE RequestNo = em.RequestNo FOR XML PATH('')), 1, 2, '') as EnquiryFor,

                ${date ? `(SELECT MAX(QuoteDate) FROM EnquiryQuotes WHERE RequestNo = em.RequestNo AND QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23)) as QuoteDate` : `(SELECT MAX(QuoteDate) FROM EnquiryQuotes WHERE RequestNo = em.RequestNo AND QuoteDate IS NOT NULL) as QuoteDate`},
                
                -- Add Quote Details prioritized by QuoteDate day match and Current User (Department)
                (
                    SELECT TOP 1 
                        QuoteNumber + ' (' + CONVERT(VARCHAR, ISNULL(QuoteDate, CreatedAt), 106) + ')' 
                    FROM EnquiryQuotes 
                    WHERE RequestNo = em.RequestNo 
                    ORDER BY 
                        ${date ? `CASE WHEN QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) THEN 1 ELSE 2 END,` : ''}
                        CASE WHEN PreparedByEmail = @queryUserEmail THEN 1 ELSE 2 END, 
                        CreatedAt DESC
                ) as QuoteRefNo,
                (
                    SELECT TOP 1 TotalAmount 
                    FROM EnquiryQuotes 
                    WHERE RequestNo = em.RequestNo 
                    ORDER BY 
                        ${date ? `CASE WHEN QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) THEN 1 ELSE 2 END,` : ''}
                        CASE WHEN PreparedByEmail = @queryUserEmail THEN 1 ELSE 2 END, 
                        CreatedAt DESC
                ) as TotalQuotedPrice,
                (
                    SELECT TOP 1 TotalAmount 
                    FROM EnquiryQuotes 
                    WHERE RequestNo = em.RequestNo 
                    ORDER BY 
                        ${date ? `CASE WHEN QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) THEN 1 ELSE 2 END,` : ''}
                        CASE WHEN PreparedByEmail = @queryUserEmail THEN 1 ELSE 2 END, 
                        CreatedAt DESC
                ) as NetQuotedPrice,
                
                em.CreatedBy,
                em.CreatedAt
            FROM EnquiryMaster em
            ${whereClause}
            ORDER BY em.CreatedAt DESC
        `;

        const result = await request.query(query);
        const enquiries = result.recordset;

        const quoteFormSuggest =
            req.query.enforceDivision === '1' || String(req.query.enforceDivision || '').toLowerCase() === 'true';

        // --- Fetch Pricing Breakdown Separately (SQL Server < 2016 Compatibility) ---
        if (enquiries.length > 0 && !quoteFormSuggest) {
            const requestNos = enquiries.map(e => e.RequestNo);

            // Fetch pricing values for these requests
            // Use ROW_NUMBER to get the latest OptionID for each RequestNo AND Item
            // This ensures we get specific items even if they were saved in a previous option but not the absolute latest one (partial saves)
            const pricingQuery = `
                SELECT RequestNo, EnquiryForItem, Price, UpdatedAt
                FROM (
                    SELECT 
                        RequestNo,
                        EnquiryForItem, 
                        Price, 
                        UpdatedAt,
                        ROW_NUMBER() OVER (PARTITION BY RequestNo, EnquiryForItem ORDER BY OptionID DESC) as rn
                    FROM EnquiryPricingValues
                    WHERE RequestNo IN (${requestNos.map(r => `'${r}'`).join(',')})
                ) t
                WHERE rn = 1
            `;

            try {
                const pricingResult = await new sql.Request().query(pricingQuery);
                const pricingMap = {};

                pricingResult.recordset.forEach(row => {
                    if (!pricingMap[row.RequestNo]) pricingMap[row.RequestNo] = [];
                    pricingMap[row.RequestNo].push({
                        EnquiryForItem: row.EnquiryForItem,
                        Price: row.Price,
                        UpdatedAt: row.UpdatedAt
                    });
                });

                // Attach to enquiries
                enquiries.forEach(row => {
                    // Stringify to match frontend expectation of JSON string
                    row.PricingBreakdown = JSON.stringify(pricingMap[row.RequestNo] || []);
                });

            } catch (err) {
                console.error('Error fetching pricing breakdown:', err);
                // Fallback to empty array
                enquiries.forEach(row => {
                    row.PricingBreakdown = "[]";
                });
            }

            // Lead-job hierarchy for dashboard table (Project / Division tree / SE columns)
            try {
                const efReq = new sql.Request();
                requestNos.forEach((no, i) => {
                    efReq.input(`ef${i}`, sql.NVarChar, String(no));
                });
                const efPlaceholders = requestNos.map((_, i) => `@ef${i}`).join(', ');
                const efRes = await efReq.query(`
                    SELECT RequestNo, ID, ParentID, ItemName, LeadJobCode, LeadJobName
                    FROM EnquiryFor
                    WHERE RequestNo IN (${efPlaceholders})
                    ORDER BY RequestNo, ID
                `);
                const jobsByReq = {};
                (efRes.recordset || []).forEach((r) => {
                    const k = String(r.RequestNo);
                    if (!jobsByReq[k]) jobsByReq[k] = [];
                    jobsByReq[k].push({
                        ID: r.ID,
                        ParentID: r.ParentID,
                        ItemName: r.ItemName,
                        LeadJobCode: r.LeadJobCode,
                        LeadJobName: r.LeadJobName,
                    });
                });
                enquiries.forEach((row) => {
                    row.EnquiryForJobs = jobsByReq[String(row.RequestNo)] || [];
                });
            } catch (err) {
                console.error('Error fetching EnquiryFor jobs for dashboard:', err);
                enquiries.forEach((row) => {
                    row.EnquiryForJobs = [];
                });
            }
        }

        res.json(enquiries);

    } catch (err) {
        console.error('Enquiry List API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
