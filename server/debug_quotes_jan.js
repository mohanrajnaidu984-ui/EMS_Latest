const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query(`
            SELECT RequestNo, QuoteNumber, QuoteDate, CreatedAt, PreparedByEmail 
            FROM EnquiryQuotes 
            WHERE RequestNo = '13'
            ORDER BY CreatedAt ASC
        `);
        console.log("Quotes for Req 13:");
        res.recordset.forEach(r => {
            console.log(`REQ: ${r.RequestNo} | NUM: ${r.QuoteNumber} | Q_DATE: ${r.QuoteDate} | CREATED: ${r.CreatedAt}`);
        });

        const allQuotes = await new sql.Request().query(`
            SELECT em.RequestNo, em.ProjectName, eq.QuoteNumber, eq.QuoteDate, eq.CreatedAt
            FROM EnquiryQuotes eq
            JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
            WHERE MONTH(ISNULL(eq.QuoteDate, eq.CreatedAt)) = 1 AND YEAR(ISNULL(eq.QuoteDate, eq.CreatedAt)) = 2026
        `);
        console.log("\nAll Quotes in Jan 2026:");
        allQuotes.recordset.forEach(r => {
            console.log(`REQ: ${r.RequestNo} | PROJ: ${r.ProjectName} | NUM: ${r.QuoteNumber} | DATE: ${r.QuoteDate || r.CreatedAt}`);
        });

    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
