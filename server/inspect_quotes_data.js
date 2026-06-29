const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query("SELECT TOP 5 RequestNo, QuoteNumber, QuoteDate FROM EnquiryQuotes");
        console.log("DATA_START");
        res.recordset.forEach(r => console.log(`${r.RequestNo} | ${r.QuoteNumber} | ${r.QuoteDate}`));
        console.log("DATA_END");
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
