'use strict';

const MONTH_3 = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
};

/** Normalize UI dates (YYYY-MM-DD or DD-MMM-YYYY) for SQL Server DATE literals. */
function normalizeSearchDateParam(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (m) {
        const mm = MONTH_3[m[2].toLowerCase().slice(0, 3)];
        if (mm) return `${m[3]}-${mm}-${String(m[1]).padStart(2, '0')}`;
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return s;
}

/** Dedupe raw list rows before a single mapQuoteListingRows pass (search perf). */
function quoteListRawRowKey(row) {
    const req = String(row?.RequestNo ?? '').trim();
    const pvRaw = row?.ListPendingPvId ?? row?.listpendingpvid;
    const pvNum = pvRaw != null && pvRaw !== '' ? Number(pvRaw) : 0;
    if (!Number.isNaN(pvNum) && pvNum > 0) return `${req}\tpv:${pvNum}`;
    return [
        req,
        String(row?.ListPendingOwnJobItem ?? row?.listpendingownjobitem ?? '')
            .trim()
            .toLowerCase(),
        String(row?.ListPendingLeadJobName ?? row?.listpendingleadjobname ?? '')
            .trim()
            .toLowerCase(),
        String(row?.ListPendingCustomerName ?? row?.listpendingcustomername ?? '')
            .trim()
            .toLowerCase(),
    ].join('\t');
}

function mergeQuoteListSearchRawRows(pendingRaw, quotedRaw, approvalRaw) {
    const seen = new Set();
    const out = [];
    const push = (row) => {
        if (!row || row.RequestNo == null) return;
        const key = quoteListRawRowKey(row);
        if (seen.has(key)) return;
        seen.add(key);
        out.push(row);
    };
    for (const row of pendingRaw || []) push(row);
    for (const row of quotedRaw || []) push(row);
    for (const row of approvalRaw || []) push(row);
    return out;
}

/**
 * Builds optional SQL fragments for /list/search (applied to EnquiryMaster E).
 * Valid when: non-empty search text, OR both quote date bounds are provided.
 *
 * Text search (case-insensitive substring) matches any of:
 * quote ref (EnquiryQuotes.QuoteNumber), project name, enquiry no., customer name,
 * client name, consultant name, prepared by (EnquiryQuotes.PreparedBy), workflow no (QuoteApprovalSteps).
 *
 * Numeric-only searches are intentionally stricter: users usually type an enquiry no.
 * Match RequestNo exactly, or the RequestNo segment in quote refs (e.g. /158-L1/), but
 * do not match quote sequence numbers such as /187-L1/158-R0.
 *
 * Date range filters on EnquiryQuotes.QuoteDate (not EnquiryMaster.EnquiryDate).
 */
function buildQuoteListSearchExtraWhere(qRaw, dateFrom, dateTo, options = {}) {
    const includeWorkflowSearch = options.includeWorkflowSearch !== false;
    const q = (qRaw || '').trim();
    const d1 = normalizeSearchDateParam(dateFrom);
    const d2 = normalizeSearchDateParam(dateTo);
    const bothDates = !!(d1 && d2);
    if (!q && !bothDates) {
        return { ok: false, sql: '' };
    }

    const lit = (s) => String(s || '').replace(/'/g, "''");
    const qqLower = q ? lit(q).toLowerCase() : '';
    const qqUpper = q ? lit(q).toUpperCase() : '';
    const numericOnly = /^\d+$/.test(q);

    let textSql = '';
    if (q) {
        if (numericOnly) {
            const workflowSql = includeWorkflowSearch
                ? `
      OR EXISTS (
        SELECT 1 FROM QuoteApprovalSteps qtWfSrch
        WHERE LTRIM(RTRIM(qtWfSrch.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
          AND LTRIM(RTRIM(ISNULL(qtWfSrch.WorkflowNo, N''))) = N'${lit(q)}'
      )`
                : '';
            textSql = `AND (
      LTRIM(RTRIM(CAST(E.RequestNo AS NVARCHAR(100)))) = N'${lit(q)}'
      OR EXISTS (
        SELECT 1 FROM EnquiryQuotes qtRefSrch
        WHERE LTRIM(RTRIM(qtRefSrch.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
          AND CHARINDEX(N'/${qqUpper}-L', UPPER(LTRIM(RTRIM(ISNULL(qtRefSrch.QuoteNumber, N''))))) > 0
      )${workflowSql}
    )`;
        } else {
            textSql = `AND (
      CHARINDEX(N'${qqLower}', LOWER(CAST(E.RequestNo AS NVARCHAR(100)))) > 0
      OR CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(E.ProjectName, N''))))) > 0
      OR CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(E.CustomerName, N''))))) > 0
      OR CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(E.ClientName, N''))))) > 0
      OR CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(E.ConsultantName, N''))))) > 0
      OR EXISTS (
        SELECT 1 FROM EnquiryQuotes qtRefSrch
        WHERE LTRIM(RTRIM(qtRefSrch.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
          AND CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(qtRefSrch.QuoteNumber, N''))))) > 0
      )
      OR EXISTS (
        SELECT 1 FROM EnquiryQuotes qtPbSrch
        WHERE LTRIM(RTRIM(qtPbSrch.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
          AND CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(qtPbSrch.PreparedBy, N''))))) > 0
      )
      ${
          includeWorkflowSearch
              ? `OR EXISTS (
        SELECT 1 FROM QuoteApprovalSteps qtWfSrch
        WHERE LTRIM(RTRIM(qtWfSrch.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
          AND CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(qtWfSrch.WorkflowNo, N''))))) > 0
      )`
              : ''
      }
    )`;
        }
    }

    let dateSql = '';
    if (d1 || d2) {
        const datePredicates = ['qtDtSrch.QuoteDate IS NOT NULL'];
        if (d1) datePredicates.push(`CAST(qtDtSrch.QuoteDate AS DATE) >= '${lit(d1)}'`);
        if (d2) datePredicates.push(`CAST(qtDtSrch.QuoteDate AS DATE) <= '${lit(d2)}'`);
        dateSql = `AND EXISTS (
      SELECT 1 FROM EnquiryQuotes qtDtSrch
      WHERE LTRIM(RTRIM(qtDtSrch.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
        AND ${datePredicates.join('\n        AND ')}
    )`;
    }

    const sql = `${textSql} ${dateSql}`.trim();
    return { ok: true, sql: sql.length ? `\n                ${sql}` : '' };
}

module.exports = buildQuoteListSearchExtraWhere;
module.exports.normalizeSearchDateParam = normalizeSearchDateParam;
module.exports.mergeQuoteListSearchRawRows = mergeQuoteListSearchRawRows;
