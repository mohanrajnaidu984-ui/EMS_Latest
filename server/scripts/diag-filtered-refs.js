const { sql, connectDB } = require('../dbConfig');

(async () => {
    await connectDB();
    const userEmail = 'mohan.naidu@almoayyedcg.com';
    const division = 'HVAC Project';

    const req = new sql.Request();
    req.input('userEmail', sql.NVarChar, userEmail);
    req.input('division', sql.NVarChar, division);

    const r = await req.query(`
        SELECT STUFF((
            SELECT ',' + CAST(Q.QuoteNumber AS NVARCHAR(MAX)) + '|' + CAST(ISNULL(Q.ToName, 'N/A') AS NVARCHAR(MAX)) + '|' + CAST(ISNULL(Q.LeadJob, '') AS NVARCHAR(MAX)) + '|' + ISNULL(CONVERT(NVARCHAR(23), Q.QuoteDate, 121), N'') + '|' + CAST(ISNULL(Q.QuoteType, '') AS NVARCHAR(MAX)) + '|' + CAST(ISNULL(Q.TotalAmount, 0) AS NVARCHAR(MAX))
            FROM EnquiryQuotes Q
            WHERE LTRIM(RTRIM(Q.RequestNo)) = '159'
            ORDER BY Q.QuoteNumber
            FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 1, '') AS FilteredQuoteRefs
    `);
    console.log('FilteredQuoteRefs sample:');
    const raw = r.recordset[0]?.FilteredQuoteRefs || '';
    console.log(raw.substring(0, 500));
    console.log('\n--- Parsed entries ---');
    raw.split(',').slice(0, 3).forEach((refStr) => {
        const parts = refStr.split('|');
        console.log({ ref: parts[0], totalAmount: parts[5], partsLen: parts.length });
    });
    process.exit(0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
