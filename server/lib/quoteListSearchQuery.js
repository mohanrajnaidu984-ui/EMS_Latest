'use strict';

const { resolvePricingAccessContext } = require('./quotePricingAccess');
const {
    buildEnquiryMasterDepartmentExistsSql,
    divisionCompareKeysCompatible,
} = require('./quoteListDivisionFilter');
const { parseUserDepartments } = require('./userDepartments');
const { normalizeSearchDateParam } = require('./buildQuoteListSearchExtraWhere');

function lit(s) {
    return String(s || '').replace(/'/g, "''");
}

function fmtRowDetailDate(raw) {
    try {
        const dt = raw ? new Date(raw) : null;
        if (!dt || Number.isNaN(dt.getTime())) return '—';
        const d = dt.getDate();
        const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
            dt.getMonth()
        ];
        return `${String(d).padStart(2, '0')}-${mon}-${dt.getFullYear()}`;
    } catch {
        return '—';
    }
}

function buildOwnJobDivisionSql(divisionFilter, alias = 'qtSeed') {
    const tokens = parseUserDepartments(divisionFilter);
    if (!tokens.length) return '';
    const parts = tokens.map((tok) => {
        const t = lit(tok);
        return `(
            LTRIM(RTRIM(ISNULL(${alias}.OwnJob, N''))) = N'${t}'
            OR LTRIM(RTRIM(ISNULL(${alias}.OwnJob, N''))) LIKE N'%${t}%'
        )`;
    });
    return `AND (${parts.join('\n            OR ')})`;
}

function ownJobMatchesDivision(ownJob, divisionFilter) {
    const tokens = parseUserDepartments(divisionFilter);
    if (!tokens.length) return true;
    const own = String(ownJob || '').trim();
    if (!own) return true;
    const ownKey = own.toLowerCase();
    return tokens.some((tok) => {
        const t = String(tok || '').trim();
        if (!t) return false;
        if (ownKey === t.toLowerCase()) return true;
        if (ownKey.includes(t.toLowerCase())) return true;
        return divisionCompareKeysCompatible(t, own);
    });
}

/**
 * Fast Search Quote path: return in-range EnquiryQuotes (+ enquiry headers).
 * List UI rows are built in JS — skips mapQuoteListingRows (pricing tree).
 */
async function runQuoteListSearchByQuoteDate(
    sqlConn,
    rawUserEmail,
    { q = '', dateFrom = '', dateTo = '', division = '' } = {},
    options = {}
) {
    const d1 = normalizeSearchDateParam(dateFrom);
    const d2 = normalizeSearchDateParam(dateTo);
    if (!d1 || !d2) {
        return { quoteRows: [], accessCtx: null, userEmail: rawUserEmail, usedFastPath: false };
    }

    let userEmail = rawUserEmail;
    if (userEmail) {
        userEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim();
    }

    const accessCtx =
        options.accessCtx != null
            ? options.accessCtx
            : userEmail
              ? await resolvePricingAccessContext(userEmail)
              : null;
    if (userEmail && (!accessCtx || !accessCtx.user)) {
        return { quoteRows: [], accessCtx: accessCtx || null, userEmail, usedFastPath: true };
    }

    const qTrim = String(q || '').trim();
    const qqLower = qTrim ? lit(qTrim).toLowerCase() : '';
    const numericOnly = /^\d+$/.test(qTrim);
    const divisionClause = buildEnquiryMasterDepartmentExistsSql(division);
    const ownJobDivisionSql = buildOwnJobDivisionSql(division, 'qtSeed');
    const isAdmin = !!(accessCtx && accessCtx.isAdmin);
    const isCcUser = !!(accessCtx && accessCtx.isCcUser);
    const isManagementDept = !!(accessCtx && accessCtx.isManagementDept);
    const uEsc = (userEmail || '').replace(/'/g, "''");
    const uLocalEsc = ((userEmail || '').split('@')[0] || '').trim().replace(/'/g, "''");

    const datePred = `
        qtSeed.QuoteDate IS NOT NULL
        AND qtSeed.QuoteDate >= CAST(N'${lit(d1)}' AS DATETIME)
        AND qtSeed.QuoteDate < DATEADD(day, 1, CAST(N'${lit(d2)}' AS DATETIME))
    `;

    let textPred = '1 = 1';
    if (qTrim) {
        if (numericOnly) {
            textPred = `(
                LTRIM(RTRIM(CAST(E.RequestNo AS NVARCHAR(100)))) = N'${lit(qTrim)}'
                OR CHARINDEX(N'/${lit(qTrim).toUpperCase()}-L', UPPER(LTRIM(RTRIM(ISNULL(qtSeed.QuoteNumber, N''))))) > 0
                OR EXISTS (
                    SELECT 1 FROM QuoteApprovalSteps qtWfSrch
                    WHERE LTRIM(RTRIM(qtWfSrch.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                      AND LTRIM(RTRIM(ISNULL(qtWfSrch.WorkflowNo, N''))) = N'${lit(qTrim)}'
                )
            )`;
        } else {
            textPred = `(
                CHARINDEX(N'${qqLower}', LOWER(CAST(E.RequestNo AS NVARCHAR(100)))) > 0
                OR CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(E.ProjectName, N''))))) > 0
                OR CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(E.CustomerName, N''))))) > 0
                OR CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(E.ClientName, N''))))) > 0
                OR CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(E.ConsultantName, N''))))) > 0
                OR CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(qtSeed.QuoteNumber, N''))))) > 0
                OR CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(qtSeed.PreparedBy, N''))))) > 0
                OR EXISTS (
                    SELECT 1 FROM QuoteApprovalSteps qtWfSrch
                    WHERE LTRIM(RTRIM(qtWfSrch.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                      AND CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(qtWfSrch.WorkflowNo, N''))))) > 0
                )
            )`;
        }
    }

    const concernedSeSql = `
            EXISTS (
                SELECT 1
                FROM ConcernedSE cs
                INNER JOIN Master_ConcernedSE m
                  ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                WHERE LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, N'')))
                  AND LOWER(LTRIM(RTRIM(m.EmailId))) = LOWER(LTRIM(N'${uEsc}'))
            )`;

    const ccCoordinatorSql = `
            EXISTS (
                SELECT 1
                FROM EnquiryFor efGate
                INNER JOIN Master_EnquiryFor mefGate ON (
                    efGate.ItemName = mefGate.ItemName OR
                    efGate.ItemName LIKE N'% - ' + mefGate.ItemName
                )
                WHERE efGate.RequestNo = E.RequestNo
                  AND (
                    REPLACE(',' + REPLACE(ISNULL(mefGate.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com') LIKE '%,${uEsc},%'
                    ${uLocalEsc.length >= 2 ? `OR REPLACE(',' + REPLACE(ISNULL(mefGate.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com') LIKE '%,${uLocalEsc},%'` : ''}
                  )
            )`;

    const approverInRangeSql = `
            EXISTS (
                SELECT 1
                FROM QuoteApprovalSteps apAcc
                WHERE apAcc.QuoteId = qtSeed.ID AND apAcc.QuoteId > 0
                  AND (
                    LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(apAcc.ApproverEmail, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com'))))
                      = LOWER(LTRIM(N'${uEsc}'))
                    ${
                        uLocalEsc.length >= 2
                            ? `OR LOWER(LTRIM(RTRIM(REPLACE(SUBSTRING(
                                  LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(apAcc.ApproverEmail, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com')))),
                                  1,
                                  NULLIF(CHARINDEX('@', LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(apAcc.ApproverEmail, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com'))))), 0) - 1
                                ), N' ', N'')))) = LOWER(LTRIM(N'${uLocalEsc}'))`
                            : ''
                    }
                  )
            )`;

    let accessPred = '1 = 1';
    if (userEmail && !isAdmin && !isManagementDept) {
        if (isCcUser) {
            accessPred = `(${concernedSeSql} OR ${ccCoordinatorSql} OR ${approverInRangeSql})`;
        } else {
            accessPred = `(${concernedSeSql} OR ${approverInRangeSql})`;
        }
    }

    const query = `
        SELECT
            E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName,
            E.EnquiryDate, E.DueDate, E.Status, E.EnquiryStatus,
            qtSeed.ID AS QuoteId,
            qtSeed.QuoteNumber,
            qtSeed.QuoteDate,
            qtSeed.QuoteNo,
            qtSeed.RevisionNo,
            qtSeed.OwnJob,
            qtSeed.LeadJob,
            qtSeed.ToName,
            qtSeed.PreparedBy,
            ISNULL(qtSeed.TotalAmount, 0) AS TotalAmount
        FROM EnquiryQuotes qtSeed
        INNER JOIN EnquiryMaster E
            ON LTRIM(RTRIM(E.RequestNo)) = LTRIM(RTRIM(qtSeed.RequestNo))
        WHERE ${datePred}
          AND ${textPred}
          AND ${accessPred}
          ${divisionClause}
          ${ownJobDivisionSql}
        ORDER BY qtSeed.QuoteDate DESC, qtSeed.ID DESC
    `;

    try {
        const result = await sqlConn.query(query);
        return {
            quoteRows: result.recordset || [],
            accessCtx,
            userEmail,
            usedFastPath: true,
        };
    } catch (err) {
        if (/Invalid object name/i.test(String(err.message || '')) && /QuoteApprovalSteps/i.test(String(err.message || ''))) {
            const queryNoWf = `
                SELECT
                    E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName,
                    E.EnquiryDate, E.DueDate, E.Status, E.EnquiryStatus,
                    qtSeed.ID AS QuoteId,
                    qtSeed.QuoteNumber,
                    qtSeed.QuoteDate,
                    qtSeed.QuoteNo,
                    qtSeed.RevisionNo,
                    qtSeed.OwnJob,
                    qtSeed.LeadJob,
                    qtSeed.ToName,
                    qtSeed.PreparedBy,
                    ISNULL(qtSeed.TotalAmount, 0) AS TotalAmount
                FROM EnquiryQuotes qtSeed
                INNER JOIN EnquiryMaster E
                    ON LTRIM(RTRIM(E.RequestNo)) = LTRIM(RTRIM(qtSeed.RequestNo))
                WHERE ${datePred}
                  AND ${textPred.replace(/OR EXISTS \(\s*SELECT 1 FROM QuoteApprovalSteps[\s\S]*?\)/gi, '')}
                  AND (
                    ${
                        userEmail && !isAdmin && !isManagementDept
                            ? isCcUser
                                ? `(${concernedSeSql} OR ${ccCoordinatorSql})`
                                : concernedSeSql
                            : '1 = 1'
                    }
                  )
                  ${divisionClause}
                  ${ownJobDivisionSql}
                ORDER BY qtSeed.QuoteDate DESC, qtSeed.ID DESC
            `;
            const result = await sqlConn.query(queryNoWf);
            return {
                quoteRows: result.recordset || [],
                accessCtx,
                userEmail,
                usedFastPath: true,
            };
        }
        throw err;
    }
}

/**
 * Build Quote Search list rows from flat in-range quote SQL rows (no pricing mapper).
 */
function buildQuoteSearchListRowsFromQuotes(quoteRows, divisionFilter = '') {
    const groups = new Map();
    for (const raw of quoteRows || []) {
        if (!raw || raw.RequestNo == null) continue;
        if (!ownJobMatchesDivision(raw.OwnJob, divisionFilter)) continue;
        const key = String(raw.RequestNo).trim();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(raw);
    }

    const out = [];
    for (const [, rows] of groups) {
        rows.sort((a, b) => {
            const ta = a.QuoteDate ? new Date(a.QuoteDate).getTime() : 0;
            const tb = b.QuoteDate ? new Date(b.QuoteDate).getTime() : 0;
            if (tb !== ta) return tb - ta;
            return Number(b.QuoteId || 0) - Number(a.QuoteId || 0);
        });

        /* Latest revision per QuoteNo only (avoid R0+R1 double-count in summary). */
        const latestByQuoteNo = new Map();
        for (const q of rows) {
            const qn = Number(q.QuoteNo);
            const key = Number.isFinite(qn) && qn > 0 ? `n:${qn}` : `id:${q.QuoteId}`;
            const prev = latestByQuoteNo.get(key);
            if (!prev) {
                latestByQuoteNo.set(key, q);
                continue;
            }
            const prevRev = Number(prev.RevisionNo) || 0;
            const nextRev = Number(q.RevisionNo) || 0;
            if (nextRev > prevRev) latestByQuoteNo.set(key, q);
            else if (nextRev === prevRev && Number(q.QuoteId || 0) > Number(prev.QuoteId || 0)) {
                latestByQuoteNo.set(key, q);
            }
        }
        const displayQuotes = [...latestByQuoteNo.values()].sort((a, b) => {
            const ta = a.QuoteDate ? new Date(a.QuoteDate).getTime() : 0;
            const tb = b.QuoteDate ? new Date(b.QuoteDate).getTime() : 0;
            return tb - ta;
        });

        const head = displayQuotes[0] || rows[0];
        const detailLines = displayQuotes.map((q) => {
            const toName = String(q.ToName || '').trim() || '—';
            const ref = String(q.QuoteNumber || '').trim();
            const dt = fmtRowDetailDate(q.QuoteDate);
            const amount = Number(q.TotalAmount) || 0;
            return {
                textLine: ref ? `${toName} (${ref} - ${dt})` : `${toName} (${dt})`,
                bdTotal: amount > 0 ? amount : null,
                preparedBy: String(q.PreparedBy || '').trim(),
                quoteDate: q.QuoteDate ?? null,
                quoteNumber: ref,
                revisionNo: Number(q.RevisionNo) || 0,
                quoteId: Number(q.QuoteId) || null,
            };
        });

        const refs = detailLines.map((ln) => ln.quoteNumber).filter(Boolean);
        const amounts = detailLines.map((ln) => Number(ln.bdTotal) || 0).filter((n) => n > 0);
        const maxAmount = amounts.length ? Math.max(...amounts) : null;
        const latestQuoteId = Number(head.QuoteId);
        const prepared = [
            ...new Set(detailLines.map((ln) => ln.preparedBy).filter(Boolean)),
        ].join(', ');

        out.push({
            RequestNo: head.RequestNo,
            ProjectName: head.ProjectName,
            CustomerName: head.CustomerName,
            ClientName: head.ClientName || '-',
            ConsultantName: head.ConsultantName || '-',
            EnquiryDate: head.EnquiryDate,
            DueDate: head.DueDate,
            Status: head.Status,
            ListQuoteId: Number.isFinite(latestQuoteId) && latestQuoteId > 0 ? latestQuoteId : null,
            ListQuoteRef: refs.join(' | '),
            ListQuoteDate: head.QuoteDate ?? null,
            ListPreparedBy: prepared,
            ListQuoteDetailToName: String(head.ToName || '').trim(),
            ListQuoteUnderRefTotal: maxAmount,
            ListQuoteDetailLines: detailLines,
            ListQuoteRollupStatus: detailLines.length > 1 ? 'Partial Quoted' : 'All Quoted',
            ListMultiLeadQuoteRefs: null,
            QuoteListKind: 'quoted',
            ApprovalWorkflowListAccess: false,
            ApprovalWorkflowQuoteId: null,
            ListApprovalWorkflowQuoteId: null,
            SubJobPrices: '',
            PricingCustomerDetails: null,
            QuotedCustomers: null,
            Divisions: null,
        });
    }

    out.sort((a, b) => {
        const ta = a.ListQuoteDate ? new Date(a.ListQuoteDate).getTime() : 0;
        const tb = b.ListQuoteDate ? new Date(b.ListQuoteDate).getTime() : 0;
        return tb - ta;
    });
    return out;
}

/** @deprecated kept for callers that still post-filter mapped rows */
function filterMappedRowsToQuoteDateRange(rows, dateFrom, dateTo) {
    const d1 = normalizeSearchDateParam(dateFrom);
    const d2 = normalizeSearchDateParam(dateTo);
    if (!d1 || !d2 || !Array.isArray(rows) || !rows.length) return rows || [];

    const startMs = new Date(`${d1}T00:00:00`).getTime();
    const endExclusive = new Date(`${d2}T00:00:00`);
    endExclusive.setDate(endExclusive.getDate() + 1);
    const endMs = endExclusive.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return rows;

    const inRange = (raw) => {
        if (raw == null || raw === '') return false;
        const t = new Date(raw).getTime();
        return Number.isFinite(t) && t >= startMs && t < endMs;
    };

    const out = [];
    for (const row of rows) {
        const lines = Array.isArray(row.ListQuoteDetailLines) ? row.ListQuoteDetailLines : [];
        const keptLines = lines.filter((ln) => inRange(ln?.quoteDate ?? ln?.QuoteDate));
        if (!keptLines.length) {
            if (!inRange(row.ListQuoteDate)) continue;
            out.push(row);
            continue;
        }
        const refs = keptLines
            .map((ln) => String(ln.quoteNumber || '').trim())
            .filter(Boolean);
        let maxQuoteDate = null;
        let maxQuoteMs = 0;
        for (const ln of keptLines) {
            const qd = ln.quoteDate ?? ln.QuoteDate;
            const t = qd != null && qd !== '' ? new Date(qd).getTime() : 0;
            if (Number.isFinite(t) && t >= maxQuoteMs) {
                maxQuoteMs = t;
                maxQuoteDate = qd;
            }
        }
        out.push({
            ...row,
            ListQuoteDetailLines: keptLines,
            ListQuoteRef: refs.length ? [...new Set(refs)].join(' | ') : row.ListQuoteRef,
            ListQuoteDate: maxQuoteDate != null ? maxQuoteDate : row.ListQuoteDate,
        });
    }
    return out;
}

module.exports = {
    runQuoteListSearchByQuoteDate,
    buildQuoteSearchListRowsFromQuotes,
    filterMappedRowsToQuoteDateRange,
};
