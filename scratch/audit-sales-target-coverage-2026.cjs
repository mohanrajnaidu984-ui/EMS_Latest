const fs = require('node:fs');
const path = require('node:path');
const { sql, dbConfig } = require('../server/dbConfig');

const query = `
WITH LatestProbability AS (
    SELECT P.*, ROW_NUMBER() OVER (
        PARTITION BY P.RequestNo, LTRIM(RTRIM(ISNULL(P.OwnJobName,N''))), LTRIM(RTRIM(ISNULL(P.LeadJobName,N'')))
        ORDER BY P.UpdatedDateTime DESC, P.ID DESC
    ) AS rn
    FROM dbo.Probability P
    INNER JOIN dbo.EnquiryMaster E ON E.RequestNo=P.RequestNo
), BookedLines AS (
    SELECT LTRIM(RTRIM(COALESCE(NULLIF(LTRIM(RTRIM(P.OwnJobName)),N''),NULLIF(LTRIM(RTRIM(P.QuoteOwnJob)),N''),N'(Unassigned)'))) AS Division,
        ISNULL(TRY_CONVERT(DECIMAL(18,2),REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(P.FinalJobValueBooked,''))),',',''),'BD',''),' ','')),0) AS Booking,
        TRY_CONVERT(DECIMAL(18,4),P.GrossMargin) AS GpPct
    FROM LatestProbability P
    INNER JOIN dbo.EnquiryMaster E ON E.RequestNo=P.RequestNo
    WHERE P.rn=1 AND LOWER(LTRIM(RTRIM(ISNULL(P.Status,''))))='won'
      AND YEAR(COALESCE(P.BookedDate,P.UpdatedDateTime,E.EnquiryDate))=@year
), Bookings AS (
    SELECT Division,COUNT(*) AS BookedJobs,SUM(Booking) AS BookedValue,
        SUM(Booking*ISNULL(GpPct,0)/100.0) AS BookedGpValue,
        SUM(CASE WHEN GpPct IS NULL THEN 1 ELSE 0 END) AS MissingBookedGp
    FROM BookedLines GROUP BY Division
), Targets AS (
    SELECT LTRIM(RTRIM(Division)) AS Division, COUNT(*) AS TargetRows,
        COUNT(DISTINCT SalesEngineer) AS Engineers,
        SUM(ISNULL(TargetValue,0)) AS TargetValue,
        SUM(CAST(ISNULL(TargetValue,0) AS DECIMAL(18,4))*CAST(ISNULL(GrossProfitTarget,0) AS DECIMAL(18,4))/100.0) AS TargetGpValue,
        MAX(COALESCE(UpdatedAt,CreatedAt)) AS LastUpdated
    FROM dbo.SalesTargets WHERE FinancialYear=@year GROUP BY LTRIM(RTRIM(Division))
), Divisions AS (
    SELECT Division FROM Bookings UNION SELECT Division FROM Targets
)
SELECT @year AS Year,D.Division,ISNULL(T.TargetRows,0) AS TargetRows,ISNULL(T.Engineers,0) AS Engineers,
    CAST(ISNULL(T.TargetValue,0) AS DECIMAL(18,2)) AS TargetValue,
    CAST(ISNULL(T.TargetGpValue,0) AS DECIMAL(18,2)) AS TargetGpValue,
    ISNULL(B.BookedJobs,0) AS BookedJobs,
    CAST(ISNULL(B.BookedValue,0) AS DECIMAL(18,2)) AS BookedValue,
    CAST(ISNULL(B.BookedGpValue,0) AS DECIMAL(18,2)) AS BookedGpValue,
    ISNULL(B.MissingBookedGp,0) AS MissingBookedGp,T.LastUpdated
FROM Divisions D LEFT JOIN Targets T ON T.Division=D.Division LEFT JOIN Bookings B ON B.Division=D.Division
ORDER BY D.Division;
SELECT DISTINCT LTRIM(RTRIM(DepartmentName)) AS Division, CompanyName, Currency, Status
FROM dbo.Master_EnquiryFor WHERE NULLIF(LTRIM(RTRIM(DepartmentName)),N'') IS NOT NULL
ORDER BY Division,CompanyName;
SELECT [Year],LTRIM(RTRIM(Division)) AS Division,Revenue,GpValue,GpPct
FROM dbo.commit_Target WHERE [Year]=@year ORDER BY Division;
`;

(async () => {
    const pool = await new sql.ConnectionPool(dbConfig).connect();
    try {
        const result = await pool.request().input('year',sql.Int,2026).query(query);
        const output = { year:2026, generatedAt:new Date().toISOString(), divisions:result.recordsets[0], masterDivisions:result.recordsets[1], commitments:result.recordsets[2] };
        fs.writeFileSync(path.join(__dirname,'sales-target-coverage-2026.json'),JSON.stringify(output,null,2));
        console.log(JSON.stringify(output));
    } finally { await pool.close(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
