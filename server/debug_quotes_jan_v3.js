const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

const run = async () => {
    try {
        await connectDB();
        const all = await new sql.Request().query(`
            SELECT em.RequestNo, eq.QuoteNumber, eq.QuoteDate, eq.CreatedAt
            FROM EnquiryQuotes eq
            JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
            WHERE MONTH(ISNULL(eq.QuoteDate, eq.CreatedAt)) = 1 AND YEAR(ISNULL(eq.QuoteDate, eq.CreatedAt)) = 2026
        `);

        let out = `TOTAL_JAN: ${all.recordset.length}\n`;
        all.recordset.forEach(r => {
            out += `REQ: ${r.RequestNo} | DATE: ${r.QuoteDate || r.CreatedAt}\n`;
        });
        fs.writeFileSync('jan_quotes_debug.txt', out);
        console.log("Done");
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
