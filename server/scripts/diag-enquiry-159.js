const { sql, connectDB } = require('../dbConfig');

(async () => {
    await connectDB();
    const r = new sql.Request();
    r.input('rn', sql.NVarChar, '159');

    const prob = await r.query(`
    SELECT ID, RequestNo, OwnJobName, LeadJobName, Status, NetQuotedValue, UpdatedDateTime, QuoteRef
    FROM Probability WHERE RequestNo = @rn ORDER BY UpdatedDateTime DESC
  `);
    console.log('=== Probability ===');
    console.table(prob.recordset);

    const cse = await r.query(`
    SELECT RequestNo, SEName, LeadJobCode, Accountability
    FROM ConcernedSE WHERE RequestNo = @rn
  `);
    console.log('=== ConcernedSE ===');
    console.table(cse.recordset);

    const ef = await r.query(`
    SELECT ID, ParentID, LeadJobCode, LeadJobName, ItemName
    FROM EnquiryFor WHERE RequestNo = @rn ORDER BY ID
  `);
    console.log('=== EnquiryFor ===');
    console.table(ef.recordset);

    const ms = await r.query(`
    SELECT FullName, Department FROM Master_ConcernedSE
    WHERE FullName IN ('Arun Dass', 'Anoj')
  `);
    console.log('=== Master_ConcernedSE ===');
    console.table(ms.recordset);

    // Simulate accountable clause for Arun + HVAC
    const sim = await r.query(`
    DECLARE @division NVARCHAR(200) = N'HVAC Project';
    DECLARE @statusSe NVARCHAR(200) = N'Arun Dass';
    DECLARE @rn NVARCHAR(20) = N'159';
    SELECT
      P.OwnJobName,
      (
        SELECT TOP 1 LTRIM(RTRIM(ISNULL(c0.SEName, N'')))
        FROM ConcernedSE c0
        WHERE c0.RequestNo = @rn
          AND UPPER(LTRIM(RTRIM(ISNULL(c0.accountability, ISNULL(c0.Accountability, N''))))) = N'YES'
          AND UPPER(LTRIM(RTRIM(ISNULL(c0.leadjobcode, ISNULL(c0.LeadJobCode, N''))))) = N'L1'
        ORDER BY c0.SEName
      ) AS CanonicalByL1Only,
      (
        SELECT TOP 1 LTRIM(RTRIM(ISNULL(c0.SEName, N'')))
        FROM ConcernedSE c0
        LEFT JOIN Master_ConcernedSE ms ON UPPER(LTRIM(RTRIM(ms.FullName))) = UPPER(LTRIM(RTRIM(c0.SEName)))
        WHERE c0.RequestNo = @rn
          AND UPPER(LTRIM(RTRIM(ISNULL(c0.accountability, ISNULL(c0.Accountability, N''))))) = N'YES'
          AND UPPER(LTRIM(RTRIM(ISNULL(ms.Department, N'')))) = UPPER(LTRIM(RTRIM(@division)))
        ORDER BY c0.SEName
      ) AS CanonicalByDivision
    FROM Probability P
    WHERE P.RequestNo = @rn AND P.ID = 222
  `);
    console.log('=== Accountable simulation ===');
    console.table(sim.recordset);

    process.exit(0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
