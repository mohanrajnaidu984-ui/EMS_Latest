const { sql, connectDB } = require('../dbConfig');

(async () => {
    await connectDB();
    const r = await sql.query`
        SELECT TOP 20
            P.RequestNo,
            P.Status,
            P.BookedDate,
            P.ExpectedDate,
            P.UpdatedDateTime,
            YEAR(COALESCE(P.BookedDate, P.UpdatedDateTime, E.EnquiryDate)) AS KpiYear,
            YEAR(COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime, E.EnquiryDate)) AS TableYear
        FROM dbo.Probability P
        INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
        WHERE LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%follow%'
          AND EXISTS (
              SELECT 1 FROM ConcernedSE cse
              WHERE cse.RequestNo = E.RequestNo AND LTRIM(RTRIM(cse.SEName)) = 'Arun Venkatesh'
          )
        ORDER BY P.UpdatedDateTime DESC
    `;
    const mismatch = r.recordset.filter((row) => row.KpiYear === 2026 && row.TableYear !== 2026);
    console.log('Total follow rows:', r.recordset.length);
    console.log('KpiYear=2026 but TableYear!=2026:', mismatch.length);
    console.log(JSON.stringify(mismatch.slice(0, 5), null, 2));
    process.exit(0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
