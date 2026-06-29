'use strict';

/**
 * Builds optional SQL fragments for /list/search (applied to EnquiryMaster E).
 * Valid when: non-empty search text, OR both quote date bounds are provided.
 *
 * Text search (case-insensitive substring) matches any of:
 * quote ref (EnquiryQuotes.QuoteNumber), project name, enquiry no., customer name,
 * client name, consultant name, prepared by (EnquiryQuotes.PreparedBy), workflow no (QuoteApprovalSteps).
 *
 * Date range filters on EnquiryQuotes.QuoteDate (not EnquiryMaster.EnquiryDate).
 */
function buildQuoteListSearchExtraWhere(qRaw, dateFrom, dateTo) {
    const q = (qRaw || '').trim();
    const d1 = (dateFrom || '').trim();
    const d2 = (dateTo || '').trim();
    const bothDates = !!(d1 && d2);
    if (!q && !bothDates) {
        return { ok: false, sql: '' };
    }

    const lit = (s) => String(s || '').replace(/'/g, "''");
    const qqLower = q ? lit(q).toLowerCase() : '';

    let textSql = '';
    if (q) {
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
      OR EXISTS (
        SELECT 1 FROM QuoteApprovalSteps qtWfSrch
        WHERE LTRIM(RTRIM(qtWfSrch.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
          AND CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(qtWfSrch.WorkflowNo, N''))))) > 0
      )
    )`;
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
