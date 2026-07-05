const { sql, connectDB } = require('../dbConfig');

(async () => {
    await connectDB();
    const quotes = await sql.query(`
        SELECT QuoteNumber, TotalAmount, RevisionNo, ToName
        FROM EnquiryQuotes
        WHERE LTRIM(RTRIM(RequestNo)) = '159'
        ORDER BY QuoteNumber, RevisionNo
    `);
    console.log('=== All quotes for 159 ===');
    console.table(quotes.recordset);

    const prob = await sql.query(`
        SELECT TOP 1 QuoteRef, NetQuotedValue, Status
        FROM Probability WHERE RequestNo = '159'
        ORDER BY UpdatedDateTime DESC
    `);
    console.log('=== Latest Probability ===');
    console.table(prob.recordset);
    process.exit(0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
