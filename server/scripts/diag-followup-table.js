const { sql, connectDB } = require('../dbConfig');

const SQL_PROB_NETQUOTED_PARSED = `
NULLIF(TRY_CONVERT(DECIMAL(18,2), REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(P.NetQuotedValue, ''))), ',', ''), 'BD', ''), ' ', '')), 0)`;

function sqlLeadJobCodeFromNameExpr(col) {
    return `CASE WHEN ${col} LIKE N'L[0-9]%' THEN LEFT(LTRIM(RTRIM(${col})), PATINDEX(N'%[^0-9]%', SUBSTRING(LTRIM(RTRIM(${col})), 2, 50) + N'X') + 1) ELSE NULL END`;
}
function sqlEfLeadJobCode(alias) {
    return `LTRIM(RTRIM(ISNULL(${alias}.LeadJobCode, N'')))`;
}
function sqlCseAccountabilityYes(alias) {
    return `UPPER(LTRIM(RTRIM(ISNULL(${alias}.accountability, N'')))) = N'YES'`;
}
function sqlCseLeadJobCode(alias) {
    return `LTRIM(RTRIM(ISNULL(${alias}.leadjobcode, N'')))`;
}
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

(async () => {
    await connectDB();
    const request = new sql.Request();
    request.input('year', sql.Int, 2026);
    request.input('company', sql.NVarChar, 'Almoayyed Air Conditioning W.L.L.');
    request.input('division', sql.NVarChar, 'BMS Project');
    request.input('statusSe', sql.NVarChar, 'Arun Venkatesh');

    const probDateExpr = 'COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime, E.EnquiryDate)';
    const kpiYearExpr = 'COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)';
    const statusOwnJobClause = ` AND UPPER(LTRIM(RTRIM(ISNULL(P.OwnJobName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))`;
    const statusTopJobFilterClause = `
      AND EXISTS (
          SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef
            ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName)
          WHERE ef.RequestNo = E.RequestNo AND LTRIM(RTRIM(mef.CompanyName)) = @company
      )
      AND EXISTS (
          SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef
            ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName)
          WHERE ef.RequestNo = E.RequestNo AND LTRIM(RTRIM(mef.DepartmentName)) = @division
      )
      ${buildSalesReportProbAccountableSeClause('Arun Venkatesh', 'statusSe')}
    `;

    const cte = `
WITH LatestProbStatusScope AS (
    SELECT * FROM (
        SELECT P.*,
            ROW_NUMBER() OVER (PARTITION BY P.RequestNo ORDER BY P.UpdatedDateTime DESC, P.ID DESC) AS __rn
        FROM dbo.Probability P
        INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
        WHERE 1 = 1
          ${statusOwnJobClause}
          ${statusTopJobFilterClause}
    ) __f WHERE __f.__rn = 1
)`;

    const followUpStatusWhere = `(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%follow%')`;
    const topJobValueExpr = `ISNULL(${SQL_PROB_NETQUOTED_PARSED}, CAST(0 AS DECIMAL(18,2)))`;

    try {
        const r1 = await request.query(`
            ${cte}
            SELECT COUNT(*) AS cnt, SUM(${topJobValueExpr}) AS total
            FROM EnquiryMaster E
            LEFT JOIN LatestProbStatusScope P ON E.RequestNo = P.RequestNo
            WHERE ${followUpStatusWhere}
              AND YEAR(${probDateExpr}) = @year
              ${buildSalesReportProbAccountableSeClause('Arun Venkatesh', 'statusSe')}
        `);
        console.log('Table query (current):', r1.recordset[0]);
    } catch (e) {
        console.error('Table query ERROR:', e.message);
    }

    const probDivisionScopeClause = ` AND (
        UPPER(LTRIM(RTRIM(ISNULL(P.OwnJobName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
        OR (LTRIM(RTRIM(ISNULL(P.OwnJobName, ''))) = '' AND UPPER(LTRIM(RTRIM(ISNULL(P.QuoteOwnJob, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, '')))))
    )`;

    const kpiCte = `
WITH LatestProbByUpdate AS (
    SELECT * FROM (
        SELECT P.*, ROW_NUMBER() OVER (PARTITION BY P.RequestNo ORDER BY P.UpdatedDateTime DESC) AS __rn
        FROM dbo.Probability P
        INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
        WHERE 1=1 ${probDivisionScopeClause} ${statusTopJobFilterClause}
    ) __lr WHERE __lr.__rn = 1
)`;

    const r2 = await request.query(`
        ${kpiCte}
        SELECT COUNT(*) AS cnt, SUM(ISNULL(TRY_CONVERT(DECIMAL(18,2), REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(P.NetQuotedValue, '0'))), ',', ''), 'BD', ''), ' ', '')), 0)) AS total
        FROM LatestProbByUpdate P
        INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
        WHERE LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%follow%'
          AND YEAR(${kpiYearExpr}) = @year
    `);
    console.log('KPI query:', r2.recordset[0]);

    process.exit(0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
