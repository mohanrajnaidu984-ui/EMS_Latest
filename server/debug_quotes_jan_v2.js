const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query(`
            SELECT RequestNo, QuoteNumber, QuoteDate, CreatedAt
            FROM EnquiryQuotes 
            WHERE RequestNo = '13'
        `);
        console.log("Q13:" + res.recordset.length);
        res.recordset.forEach(r => console.log(`QDATE:${r.QuoteDate} CDATE:${r.CreatedAt}`));

        const all = await new sql.Request().query(`
            SELECT em.RequestNo, eq.QuoteNumber, eq.QuoteDate, eq.CreatedAt
            FROM EnquiryQuotes eq
            JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
            WHERE MONTH(ISNULL(eq.QuoteDate, eq.CreatedAt)) = 1 AND YEAR(ISNULL(eq.QuoteDate, eq.CreatedAt)) = 2026
        `);
        console.log("TOTAL_JAN:" + all.recordset.length);
        all.recordset.forEach(r => console.log(`REQ:${r.RequestNo} D:${r.QuoteDate || r.CreatedAt}`));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
