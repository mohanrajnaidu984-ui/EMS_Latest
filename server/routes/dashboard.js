const express = require('express');
const router = express.Router();
const { sql } = require('../dbConfig');
const runQuotedQuoteListQuery = require('../lib/quotedQuoteListQuery');
const mapQuoteListingRows = require('../lib/mapQuoteListingRows');
const { pickConcernedSeMembersForQuote } = require('../lib/pickConcernedSeMembersForQuote');
const { mapConcernedSEAssignmentsFromRows } = require('../lib/concernedSeAssignments.cjs');

/** Avoid duplicate Master_ConcernedSE / Master_EnquiryFor hits on rapid dashboard + modal calls. */
const DASHBOARD_ACCESS_CACHE_MS = 90_000;
const dashboardAccessCache = new Map();

/** Short TTL for calendars-history (heavy); filter/month revisits skip a full SQL rebuild. */
const DASHBOARD_HISTORY_CACHE_MS = 90_000;
const dashboardHistoryCache = new Map();
const DASHBOARD_HISTORY_CACHE_MAX = 40;
const pendingCalendarScopes = new Map();

function dashboardHistoryCacheKey(query) {
    /* v3: New/Rev Quote attributed by ConcernedSE assignment (all SEs), not PreparedBy. */
    const q = query || {};
    return [
        'v3-se-assigned',
        String(q.userEmail || '').toLowerCase().trim(),
        String(q.userRole || '').toLowerCase().trim(),
        String(q.division || ''),
        String(q.salesEngineer || ''),
        String(q.anchorMonth || ''),
        String(q.anchorYear || ''),
        String(q.count || '12'),
        String(q.futureCount || '0'),
        String(q.today || ''),
    ].join('|');
}

/** Exclude Inactive enquiries (NULL/blank EnquiryStatus treated as Active). Alias must be EnquiryMaster. */
function sqlExcludeInactiveEnquiry(alias = 'em') {
    return ` AND (${alias}.EnquiryStatus IS NULL OR LTRIM(RTRIM(${alias}.EnquiryStatus)) = N'' OR LTRIM(RTRIM(${alias}.EnquiryStatus)) <> N'Inactive') `;
}

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
    if (!email) return { accessMode: 'assigned', fullName: '', isManagementDept: false };

    if (dashboardRoleIsAdmin(userRole)) {
        const userRes = await sql.query`
            SELECT TOP 1 FullName
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${email}
        `;
        const fullName = (userRes.recordset?.[0]?.FullName || '').toString().trim();
        // Admin/System: full quote visibility (same as selecting All Divisions with all departments).
        return { accessMode: 'department', fullName, isManagementDept: false, isAdmin: true };
    }

    const cacheKey = `v2|${email}|${String(userRole || '').toLowerCase()}`;
    const now = Date.now();
    const cached = dashboardAccessCache.get(cacheKey);
    if (
        cached &&
        now - cached.t < DASHBOARD_ACCESS_CACHE_MS &&
        cached.v &&
        typeof cached.v.isManagementDept === 'boolean'
    ) {
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
              AND (
                LOWER(LTRIM(RTRIM(ISNULL(Department, N'')))) = N'management'
                OR N',' + REPLACE(LOWER(LTRIM(RTRIM(ISNULL(Department, N'')))), N' ', N'') + N','
                   LIKE N'%,management,%'
              )
        `
    ]);

    const fullName = (userRes.recordset?.[0]?.FullName || '').toString().trim();
    const isManagementDept = (mgmtRes.recordset?.length || 0) > 0;
    const isCcUser = (ccRes.recordset?.length || 0) > 0 || isManagementDept;
    const v = {
        accessMode: isCcUser ? 'department' : 'assigned',
        fullName,
        isManagementDept,
        isAdmin: false,
    };
    dashboardAccessCache.set(cacheKey, { t: now, v });
    return v;
}

/**
 * Quote must belong to the given SE via ConcernedSE assignment (any preparer).
 * Prefer OwnJob match when ConcernedSE.OwnJob is populated; otherwise any assignment on the enquiry.
 * @param {'@salesEngineer'|'@currentUserName'} seParamSql
 */
function buildSeAssignedQuoteScopeSql(seParamSql) {
    return `
            AND EXISTS (
                SELECT 1
                FROM ConcernedSE cseQ
                WHERE cseQ.RequestNo = eq.RequestNo
                  AND UPPER(LTRIM(RTRIM(ISNULL(cseQ.SEName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(${seParamSql}, N''))))
                  AND (
                    NULLIF(LTRIM(RTRIM(ISNULL(cseQ.OwnJob, N''))), N'') IS NULL
                    OR NULLIF(LTRIM(RTRIM(ISNULL(eq.OwnJob, N''))), N'') IS NULL
                    OR UPPER(LTRIM(RTRIM(ISNULL(eq.OwnJob, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cseQ.OwnJob, N''))))
                    OR UPPER(LTRIM(RTRIM(ISNULL(eq.OwnJob, N'')))) LIKE UPPER(LTRIM(RTRIM(ISNULL(cseQ.OwnJob, N'')))) + N'%'
                    OR UPPER(LTRIM(RTRIM(ISNULL(cseQ.OwnJob, N'')))) LIKE UPPER(LTRIM(RTRIM(ISNULL(eq.OwnJob, N'')))) + N'%'
                  )
            )`;
}

/**
 * SQL fragment for EnquiryQuotes `eq` in FilteredQuotes / calendar quote chips / day popups.
 * New/Rev Quote counts are always by **assigned SE** (ConcernedSE), never by PreparedBy.
 * - Specific SE filter (all roles): quotes where that SE is assigned (OwnJob match when present).
 * - Assigned (non–CC) user, All SEs: quotes where the logged-in SE is assigned.
 * - Department (CC) + All SEs: quotes in divisions the user can access (CCMailIds / dept),
 *   or prepared by the user — never other divisions on a shared enquiry.
 * - Admin/Management + All SEs: unrestricted.
 */
function buildDashboardQuoteScopeFilter(isDeptMode, salesEngineer, options = {}) {
    const unrestricted = options.isAdmin === true || options.isManagementDept === true;
    const seName = String(salesEngineer || '').trim();
    const seSelected = seName !== '' && seName.toLowerCase() !== 'all';

    /* Any viewer picking an SE: attribute quotes by that SE's ConcernedSE assignment. */
    if (seSelected) {
        return buildSeAssignedQuoteScopeSql('@salesEngineer');
    }

    if (unrestricted) {
        return '';
    }

    /* Regular SE locked to themselves: still attribute by their ConcernedSE assignment. */
    if (!isDeptMode) {
        return buildSeAssignedQuoteScopeSql('@currentUserName');
    }

    const preparedBySelf = `
                LOWER(LTRIM(RTRIM(ISNULL(eq.PreparedByEmail, '')))) = LOWER(LTRIM(RTRIM(ISNULL(@currentUserEmail, ''))))
                OR UPPER(LTRIM(RTRIM(ISNULL(eq.PreparedBy, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@currentUserName, ''))))`;

    // CC coordinator, All SEs: keep quotes inside the user's accessible divisions only.
    return `
            AND (
                ${preparedBySelf}
                OR EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefScope
                    WHERE ',' + REPLACE(REPLACE(LOWER(ISNULL(mefScope.CCMailIds, '')), ' ', ''), ';', ',') + ','
                          LIKE '%,' + LOWER(LTRIM(RTRIM(ISNULL(@currentUserEmail, '')))) + ',%'
                      AND (
                        (
                            NULLIF(LTRIM(RTRIM(ISNULL(eq.OwnJob, ''))), '') IS NOT NULL
                            AND (
                                UPPER(LTRIM(RTRIM(ISNULL(mefScope.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(eq.OwnJob, ''))))
                                OR UPPER(LTRIM(RTRIM(ISNULL(mefScope.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(eq.OwnJob, ''))))
                                OR UPPER(LTRIM(RTRIM(ISNULL(eq.OwnJob, '')))) LIKE UPPER(LTRIM(RTRIM(ISNULL(mefScope.ItemName, '')))) + N'%'
                                OR UPPER(LTRIM(RTRIM(ISNULL(mefScope.ItemName, '')))) LIKE UPPER(LTRIM(RTRIM(ISNULL(eq.OwnJob, '')))) + N'%'
                            )
                        )
                        OR (
                            LTRIM(RTRIM(ISNULL(mefScope.DivisionCode, ''))) <> ''
                            AND (
                                CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefScope.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                                OR CHARINDEX('-' + UPPER(LTRIM(RTRIM(ISNULL(mefScope.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                                OR CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefScope.DivisionCode, '')))) + '-', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                            )
                        )
                      )
                )
                OR EXISTS (
                    SELECT 1
                    FROM Master_ConcernedSE mcsScope
                    WHERE LOWER(LTRIM(RTRIM(ISNULL(mcsScope.EmailId, '')))) = LOWER(LTRIM(RTRIM(ISNULL(@currentUserEmail, ''))))
                      AND NULLIF(LTRIM(RTRIM(ISNULL(eq.OwnJob, ''))), '') IS NOT NULL
                      AND (
                        LOWER(LTRIM(RTRIM(ISNULL(mcsScope.Department, '')))) = LOWER(LTRIM(RTRIM(ISNULL(eq.OwnJob, ''))))
                        OR N',' + REPLACE(LOWER(LTRIM(RTRIM(ISNULL(mcsScope.Department, '')))), N' ', N'') + N','
                           LIKE N'%,' + REPLACE(LOWER(LTRIM(RTRIM(ISNULL(eq.OwnJob, '')))), N' ', N'') + N',%'
                        OR LOWER(LTRIM(RTRIM(ISNULL(eq.OwnJob, '')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(mcsScope.Department, '')))) + N'%'
                      )
                )
            )`;
}

/** Options for {@link buildDashboardQuoteScopeFilter} from resolveDashboardAccessMode + role. */
function quoteScopeOptionsFromResolved(resolved, userRole) {
    return {
        isAdmin: resolved?.isAdmin === true || dashboardRoleIsAdmin(userRole),
        isManagementDept: resolved?.isManagementDept === true,
    };
}

/** True when the enquiry has no row in EnquiryQuotes (any preparer — hides Due/Lapsed once any quote exists). */
const SQL_NO_QUOTE_FOR_ENQUIRY = (emAlias = 'em') =>
    `NOT EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = ${emAlias}.RequestNo)`;

function sqlNVarCharLiteral(s) {
    return `N'${String(s || '').replace(/'/g, "''")}'`;
}

/** QuoteNumber matches any of the given DivisionCode values (pre-resolved; avoids Master_EnquiryFor per row). */
function sqlQuoteNumberMatchesDivisionCodes(eqAlias, codes) {
    const list = (Array.isArray(codes) ? codes : [])
        .map((c) => String(c || '').trim().toUpperCase())
        .filter(Boolean);
    if (!list.length) return '1 = 0';
    return list
        .map((code) => {
            const lit = sqlNVarCharLiteral(code);
            return `(
                CHARINDEX(N'/' + ${lit} + N'/', UPPER(ISNULL(${eqAlias}.QuoteNumber, N''))) > 0
                OR CHARINDEX(N'-' + ${lit} + N'/', UPPER(ISNULL(${eqAlias}.QuoteNumber, N''))) > 0
                OR CHARINDEX(N'/' + ${lit} + N'-', UPPER(ISNULL(${eqAlias}.QuoteNumber, N''))) > 0
            )`;
        })
        .join('\n                OR ');
}

/** Resolve Master_EnquiryFor.DivisionCode values for a dashboard division label (once per request). */
async function resolveDashboardDivisionCodes(division) {
    const div = String(division || '').trim();
    if (!div || div.toLowerCase() === 'all') return [];
    try {
        const result = await sql.query`
            SELECT DISTINCT LTRIM(RTRIM(ISNULL(DivisionCode, N''))) AS DivisionCode
            FROM Master_EnquiryFor
            WHERE (
                UPPER(LTRIM(RTRIM(ISNULL(DepartmentName, N'')))) = UPPER(LTRIM(RTRIM(${div})))
                OR UPPER(LTRIM(RTRIM(ISNULL(ItemName, N'')))) = UPPER(LTRIM(RTRIM(${div})))
            )
              AND LTRIM(RTRIM(ISNULL(DivisionCode, N''))) <> N''
        `;
        return (result.recordset || [])
            .map((r) => String(r.DivisionCode || '').trim())
            .filter(Boolean);
    } catch (err) {
        console.warn('[dashboard] resolveDashboardDivisionCodes:', err.message);
        return [];
    }
}

/**
 * Division-aware "no quote" gate for Due/Lapsed.
 * When a division is selected, an enquiry remains Due/Lapsed until that division has a quote,
 * even if some other division on the same enquiry already quoted it.
 * Pass `divisionCodes` when already resolved to skip correlated Master_EnquiryFor lookups.
 */
function buildDashboardNoQuoteSql(emAlias = 'em', division = '', divisionCodes = null) {
    const div = String(division || '').trim();
    if (!div || div.toLowerCase() === 'all') {
        return SQL_NO_QUOTE_FOR_ENQUIRY(emAlias);
    }
    const codes = Array.isArray(divisionCodes) ? divisionCodes : null;
    if (codes && codes.length) {
        return `NOT EXISTS (
        SELECT 1
        FROM EnquiryQuotes eq
        WHERE eq.RequestNo = ${emAlias}.RequestNo
          AND (
                ${sqlQuoteNumberMatchesDivisionCodes('eq', codes)}
          )
    )`;
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

/**
 * Same customer label as Quote Search: EnquiryQuotes.ToName (whom we quoted),
 * including internal customers like "Civil Project". Never substitute OwnJob/LeadJob.
 */
function buildDashboardQuoteDetailLine(qt, seRowsForReq = []) {
    const qn = String(qt.QuoteNumber || '').trim();
    const toName = String(qt.ToName || '').trim();
    const lCode =
        extractLCodeFromLeadJobName(qt.LeadJob) || extractLCodeFromLeadJobName(qn) || '';
    const label = lCode && toName ? `${toName} - ${lCode}` : toName || '—';
    const textLine = `${label} (${qn} - ${fmtDashboardQuoteDetailDate(qt.QuoteDate)})`;
    const ta = parseFloat(qt.TotalAmount);
    const quoteYmd = String(qt.QuoteYmd || '').trim() || null;
    const seMembers = pickConcernedSeMembersForQuote(qt, seRowsForReq);
    const concernedSe = seMembers.map((m) => m.name).join(', ');
    return {
        textLine,
        quoteDate: qt.QuoteDate,
        quoteYmd,
        /** All assigned SEs for this OwnJob; accountable flagged for bold UI (like Enquiry). */
        seMembers,
        concernedSe,
        preparedBy: concernedSe || String(qt.PreparedBy || '').trim(),
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
    const rows = result.recordset || [];
    const reqNos = [...new Set(rows.map((r) => String(r.RequestNo || '').trim()).filter(Boolean))];
    const seByReq = new Map();
    if (reqNos.length) {
        const esc = (s) => String(s).replace(/'/g, "''");
        const inCsv = reqNos.map((id) => `'${esc(id)}'`).join(', ');
        const seRes = await request.query(`
            SELECT
                cse.RequestNo,
                cse.SEName,
                cse.accountability,
                cse.leadjobcode,
                cse.ownjob,
                mcs.Department
            FROM ConcernedSE cse
            LEFT JOIN Master_ConcernedSE mcs
                ON UPPER(LTRIM(RTRIM(ISNULL(mcs.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cse.SEName, N''))))
            WHERE cse.RequestNo IN (${inCsv})
            ORDER BY cse.RequestNo, cse.SEName
        `);
        for (const r of seRes.recordset || []) {
            const req = String(r.RequestNo || '').trim();
            if (!req) continue;
            if (!seByReq.has(req)) seByReq.set(req, []);
            seByReq.get(req).push(r);
        }
    }

    const byReq = new Map();
    for (const r of rows) {
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
        byReq.get(req).ListQuoteDetailLines.push(
            buildDashboardQuoteDetailLine(r, seByReq.get(req) || [])
        );
    }
    for (const row of byReq.values()) {
        const names = [
            ...new Set(
                (row.ListQuoteDetailLines || []).flatMap((ln) => {
                    if (Array.isArray(ln.seMembers) && ln.seMembers.length) {
                        return ln.seMembers.map((m) => String(m.name || '').trim()).filter(Boolean);
                    }
                    return [String(ln.concernedSe || ln.preparedBy || '').trim()].filter(Boolean);
                }),
            ),
        ];
        if (names.length) row.ListPreparedBy = names.join(', ');
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
function bindDashboardCalendarFilters(request, query, resolved, options = {}) {
    const { division, salesEngineer, userEmail, userName, userRole } = query;
    const effectiveUserName = (resolved.fullName || userName || '').toString().trim();
    const isDeptMode = resolved.accessMode === 'department';
    const divisionCodes = Array.isArray(options.divisionCodes) ? options.divisionCodes : null;

    let baseFilter = '';
    if (division && division !== 'All') {
        if (isDeptMode) {
            baseFilter += ` AND EXISTS (
                    SELECT 1
                    FROM EnquiryFor ef
                    JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
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
    baseFilter += sqlExcludeInactiveEnquiry('em');

    let quoteScopeFilter = buildDashboardQuoteScopeFilter(
        isDeptMode,
        salesEngineer,
        quoteScopeOptionsFromResolved(resolved, userRole)
    );
    if (division && division !== 'All') {
        if (divisionCodes && divisionCodes.length) {
            quoteScopeFilter += `
                AND (
                    ${sqlQuoteNumberMatchesDivisionCodes('eq', divisionCodes)}
                )
            `;
        } else {
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
    }

    const todayStr = getDashboardTodayYmd(query);
    request.input('today', sql.VarChar(10), todayStr);

    return { baseFilter, quoteScopeFilter, todayStr, divisionCodes };
}

/**
 * Calendar KPI SQL.
 * @param {{ groupBy?: 'day'|'month', divisionCodes?: string[] }} [options]
 * - day: left-panel calendar chips
 * - month: right-panel history (totals only; much cheaper GROUP BY)
 * Each branch bounds its own date column, so it can use that column's index.
 */
function buildDashboardCalendarMergedBatchSql(baseFilter, quoteScopeFilter, division = '', options = {}) {
    const groupByMonth = options.groupBy === 'month';
    const divisionCodes = Array.isArray(options.divisionCodes) ? options.divisionCodes : null;
    const dueNoQuoteSql = buildDashboardNoQuoteSql('fe', division, divisionCodes);
    const periodExpr = groupByMonth
        ? `CONVERT(VARCHAR(7), DateVal, 23)`
        : `CONVERT(VARCHAR(10), DateVal, 23)`;
    const periodAlias = groupByMonth ? 'YearMonth' : 'Date';

    return `
            WITH FilteredEnquiries AS (
                SELECT RequestNo, EnquiryDate, DueDate, SiteVisitDate
                FROM EnquiryMaster em
                WHERE 1=1 ${baseFilter}
            ),
            Dates AS (
                SELECT EnquiryDate as DateVal, 'Enquiry' as Type FROM FilteredEnquiries WHERE EnquiryDate >= @rangeStart AND EnquiryDate < @rangeEnd
                UNION ALL
                SELECT fe.DueDate as DateVal,
                    CASE WHEN CAST(fe.DueDate AS DATE) >= CAST(@today AS DATE) THEN 'Due' ELSE 'Lapsed' END as Type
                FROM FilteredEnquiries fe
                WHERE fe.DueDate >= @rangeStart AND fe.DueDate < @rangeEnd
                  AND ${dueNoQuoteSql}
                UNION ALL
                SELECT SiteVisitDate as DateVal, 'SiteVisit' as Type FROM FilteredEnquiries WHERE SiteVisitDate >= @rangeStart AND SiteVisitDate < @rangeEnd
                UNION ALL
                SELECT CAST(eq.QuoteDate AS DATE) AS DateVal,
                    CASE WHEN ISNULL(eq.RevisionNo, 0) = 0 THEN 'NewQuote' ELSE 'RevQuote' END AS Type
                FROM EnquiryQuotes eq
                JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
                WHERE 1=1 ${baseFilter} ${quoteScopeFilter}
                  AND eq.QuoteDate IS NOT NULL
                  AND eq.QuoteDate >= @rangeStart AND eq.QuoteDate < @rangeEnd
            )
            SELECT
                ${periodExpr} as ${periodAlias},
                SUM(CASE WHEN Type = 'Enquiry' THEN 1 ELSE 0 END) as Enquiries,
                SUM(CASE WHEN Type = 'Due' THEN 1 ELSE 0 END) as Due,
                SUM(CASE WHEN Type = 'Lapsed' THEN 1 ELSE 0 END) as Lapsed,
                SUM(CASE WHEN Type = 'SiteVisit' THEN 1 ELSE 0 END) as SiteVisits,
                SUM(CASE WHEN Type = 'NewQuote' THEN 1 ELSE 0 END) as NewQuote,
                SUM(CASE WHEN Type = 'RevQuote' THEN 1 ELSE 0 END) as RevQuote,
                SUM(CASE WHEN Type IN ('NewQuote', 'RevQuote') THEN 1 ELSE 0 END) as Quoted
            FROM Dates
            WHERE DateVal IS NOT NULL
            GROUP BY ${periodExpr}`;
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


// One date-range query supplies all visible months; daily rows already define KPI totals.
function bindCalendarRange(request, fromYear, fromMonth, toYear, toMonth) {
    request.input('rangeStart', sql.Date, new Date(Date.UTC(fromYear, fromMonth - 1, 1)));
    request.input('rangeEnd', sql.Date, new Date(Date.UTC(toYear, toMonth, 1)));
}

/** Concurrent calendar and history requests for the same scope share the master-data lookups. */
function resolveDashboardCalendarScope({ userEmail, userRole, division }) {
    const key = JSON.stringify([userEmail, userRole, division]);
    const pending = pendingCalendarScopes.get(key);
    if (pending) return pending;

    const scope = Promise.all([
        resolveDashboardAccessMode(userEmail, userRole),
        resolveDashboardDivisionCodes(division),
    ]).finally(() => pendingCalendarScopes.delete(key));
    pendingCalendarScopes.set(key, scope);
    return scope;
}

async function runDashboardCalendarMonthQuery(reqQuery, month, year) {
    const [resolved, divisionCodes] = await resolveDashboardCalendarScope(reqQuery);
    const request = new sql.Request();
    const { baseFilter, quoteScopeFilter } = bindDashboardCalendarFilters(request, reqQuery, resolved, {
        divisionCodes,
    });
    bindCalendarRange(request, Number(year), Number(month), Number(year), Number(month));
    const result = await request.query(
        buildDashboardCalendarMergedBatchSql(baseFilter, quoteScopeFilter, reqQuery.division, {
            divisionCodes,
        })
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
    const inactiveSql = sqlExcludeInactiveEnquiry('em');
    whereClause += inactiveSql;

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

    /** Same enquiry visibility as GET /calendar quoted totals (division + SE + access + active on `em`). Omit when search bypasses those filters. */
    const calendarEmBaseFilterSql = isSearchActive
        ? null
        : `${divisionSql}${seSql}${accessSql}${inactiveSql}`;

    const seForQuoteScope = isSearchActive ? 'All' : salesEngineer;
    let quoteScopeFilter = buildDashboardQuoteScopeFilter(
        isDeptMode,
        seForQuoteScope,
        quoteScopeOptionsFromResolved(resolved, userRole)
    );
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
    const t0 = Date.now();
    try {
        const { anchorMonth, anchorYear, count, futureCount } = req.query;
        if (!anchorMonth || !anchorYear) {
            return res.status(400).json({ error: 'anchorMonth and anchorYear are required' });
        }

        const cacheKey = dashboardHistoryCacheKey(req.query);
        const cached = dashboardHistoryCache.get(cacheKey);
        if (cached && Date.now() - cached.t < DASHBOARD_HISTORY_CACHE_MS) {
            console.log(
                `[dashboard/calendars-history] cacheHit totalMs=${Date.now() - t0} div=${String(req.query.division || '-').slice(0, 24)}`,
            );
            return res.json(cached.payload);
        }

        const monthList = dashboardMonthsHistoryRange(
            anchorMonth,
            anchorYear,
            count,
            futureCount,
        );
        const [resolved, divisionCodes] = await resolveDashboardCalendarScope(req.query);
        const tAccess = Date.now();

        const anchorY = parseInt(anchorYear, 10);
        /*
         * Query only the history panel window (12 past + 2 future).
         * Avoid expanding to a full calendar year — that nearly doubled the SQL range
         * when the anchor was early in the year. Year totals are summed from months
         * present in this window (UI already falls back the same way).
         */
        const ordered = monthList
            .slice()
            .sort((a, b) => a.year - b.year || a.month - b.month);

        const emptyTotals = reconcileCalendarTotalsFromDaily([], null);
        const totalsFromMonthRow = (row) => ({
            enquiries: Number(row?.Enquiries) || 0,
            due: Number(row?.Due) || 0,
            lapsed: Number(row?.Lapsed) || 0,
            newQuote: Number(row?.NewQuote) || 0,
            revQuote: Number(row?.RevQuote) || 0,
            quoted: Number(row?.Quoted) || 0,
            siteVisits: Number(row?.SiteVisits) || 0,
            _sqlTotals: null,
        });

        /** Run one history window (month-aggregated). Split long ranges for parallel SQL. */
        const runHistoryWindow = async (fromMeta, toMeta) => {
            const request = new sql.Request();
            request.timeout = 120000;
            const { baseFilter, quoteScopeFilter } = bindDashboardCalendarFilters(
                request,
                req.query,
                resolved,
                { divisionCodes },
            );
            bindCalendarRange(request, fromMeta.year, fromMeta.month, toMeta.year, toMeta.month);
            const result = await request.query(
                buildDashboardCalendarMergedBatchSql(
                    baseFilter,
                    quoteScopeFilter,
                    req.query.division,
                    { groupBy: 'month', divisionCodes },
                ),
            );
            return result.recordset || [];
        };

        /*
         * Split ~14 months into two parallel windows so wall-clock drops ~2× under load.
         * Right panel only needs month totals (no daily rows).
         */
        const mid = Math.ceil(ordered.length / 2) || 1;
        const windows = [
            ordered.slice(0, mid),
            ordered.slice(mid),
        ].filter((w) => w.length > 0);
        const windowRows = await Promise.all(
            windows.map((w) => runHistoryWindow(w[0], w[w.length - 1])),
        );
        const tSql = Date.now();
        const monthRows = windowRows.flat();
        const monthPayloadByKey = new Map();
        for (const row of monthRows) {
            const ym = String(row.YearMonth || '').trim();
            const m = ym.match(/^(\d{4})-(\d{2})$/);
            if (!m) continue;
            const key = dashboardMonthPayloadKey(Number(m[1]), Number(m[2]));
            monthPayloadByKey.set(key, {
                daily: [],
                totals: totalsFromMonthRow(row),
            });
        }
        for (const meta of monthList) {
            const key = dashboardMonthPayloadKey(meta.year, meta.month);
            if (!monthPayloadByKey.has(key)) {
                monthPayloadByKey.set(key, { daily: [], totals: emptyTotals });
            }
        }

        const yearTotals = sumDashboardYearTotals(monthPayloadByKey, anchorY);
        const payload = {
            anchorMonth: parseInt(anchorMonth, 10),
            anchorYear: anchorY,
            yearTotals,
            months: monthList.map((meta) => {
                const row =
                    monthPayloadByKey.get(dashboardMonthPayloadKey(meta.year, meta.month)) || {
                        daily: [],
                        totals: emptyTotals,
                    };
                return {
                    month: meta.month,
                    year: meta.year,
                    daily: [],
                    totals: row.totals,
                };
            }),
        };

        dashboardHistoryCache.set(cacheKey, { t: Date.now(), payload });
        if (dashboardHistoryCache.size > DASHBOARD_HISTORY_CACHE_MAX) {
            const oldest = dashboardHistoryCache.keys().next().value;
            if (oldest != null) dashboardHistoryCache.delete(oldest);
        }

        console.log(
            `[dashboard/calendars-history] accessMs=${tAccess - t0} sqlMs=${tSql - tAccess} totalMs=${Date.now() - t0} months=${monthRows.length} div=${String(req.query.division || '-').slice(0, 24)}`,
        );
        res.json(payload);
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
        const [resolved, divisionCodes] = await resolveDashboardCalendarScope(req.query);

        const runOne = async (m, y) => {
            const request = new sql.Request();
            const { baseFilter, quoteScopeFilter } = bindDashboardCalendarFilters(
                request,
                req.query,
                resolved,
                { divisionCodes },
            );
            bindCalendarRange(request, Number(y), Number(m), Number(y), Number(m));
            const result = await request.query(
                buildDashboardCalendarMergedBatchSql(baseFilter, quoteScopeFilter, req.query.division, {
                    divisionCodes,
                }),
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
        baseFilter += sqlExcludeInactiveEnquiry('em');
        let quoteScopeFilter = buildDashboardQuoteScopeFilter(
            isDeptMode,
            salesEngineer,
            quoteScopeOptionsFromResolved(resolved, userRole)
        );
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

        /* Sargable day bounds (no CONVERT on columns). Separate COUNTs — NOT EXISTS cannot sit inside SUM(CASE). */
        const todayStr = getDashboardTodayYmd(req.query);
        const todayNextStr = (() => {
            const d = new Date(`${todayStr}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() + 1);
            return d.toISOString().slice(0, 10);
        })();
        const query = `
            SELECT
                (SELECT COUNT(*) FROM EnquiryMaster em
                  WHERE em.EnquiryDate >= @todayDate AND em.EnquiryDate < @todayNext
                  ${baseFilter}) AS EnquiriesToday,
                (SELECT COUNT(*) FROM EnquiryMaster em
                  WHERE em.DueDate >= @todayDate AND em.DueDate < @todayNext
                    AND ${noQuoteSql}
                  ${baseFilter}) AS DueToday,
                (SELECT COUNT(*) FROM EnquiryMaster em
                  WHERE em.DueDate >= @todayNext
                    AND ${noQuoteSql}
                  ${baseFilter}) AS UpcomingDues,
                (SELECT COUNT(*) FROM EnquiryMaster em
                  WHERE em.Status IN (N'Quoted', N'Quote', N'Submitted')
                  ${baseFilter}) AS QuotedCount,
                (SELECT COUNT(*) FROM EnquiryMaster em
                  WHERE em.DueDate < @todayDate
                    AND ${noQuoteSql}
                  ${baseFilter}) AS LapsedCount
        `;

        request.input('todayDate', sql.Date, todayStr);
        request.input('todayNext', sql.Date, todayNextStr);
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

            // ConcernedSE assignments (accountability) — same shape as Enquiry Search so
            // accountable SE names render bold in the Divisions column for multi-SE rows.
            try {
                const seReq = new sql.Request();
                requestNos.forEach((no, i) => {
                    seReq.input(`se${i}`, sql.NVarChar, String(no));
                });
                const sePlaceholders = requestNos.map((_, i) => `@se${i}`).join(', ');
                const seRes = await seReq.query(`
                    SELECT RequestNo, SEName, LeadJobCode, Accountability, OwnJob
                    FROM ConcernedSE
                    WHERE RequestNo IN (${sePlaceholders})
                    ORDER BY RequestNo, SEName
                `);
                const seByReq = {};
                (seRes.recordset || []).forEach((r) => {
                    const k = String(r.RequestNo);
                    if (!seByReq[k]) seByReq[k] = [];
                    seByReq[k].push(r);
                });
                enquiries.forEach((row) => {
                    const rowsForReq = seByReq[String(row.RequestNo)] || [];
                    row.ConcernedSEAssignments = mapConcernedSEAssignmentsFromRows(rowsForReq);
                    const names = [
                        ...new Set(
                            rowsForReq
                                .map((r) => String(r.SEName || '').trim())
                                .filter(Boolean)
                        ),
                    ];
                    if (names.length) {
                        row.SelectedConcernedSEs = names;
                        if (!String(row.ConcernedSE || '').trim()) {
                            row.ConcernedSE = names.join(', ');
                        }
                    }
                });
            } catch (err) {
                console.error('Error fetching ConcernedSE assignments for dashboard:', err);
                enquiries.forEach((row) => {
                    if (!Array.isArray(row.ConcernedSEAssignments)) row.ConcernedSEAssignments = [];
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
