const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryFor'");
        console.log("COLS:" + res.recordset.map(c => c.COLUMN_NAME).join(","));

        const data = await new sql.Request().query("SELECT TOP 1 * FROM EnquiryFor WHERE RequestNo = '20'");
        console.log("DATA:" + JSON.stringify(data.recordset[0]));

        // Let's also check Quote_Details/EnquiryQuoteDetails if they exist
        const tables = await new sql.Request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Quote%'");
        console.log("TABLES:" + tables.recordset.map(t => t.TABLE_NAME).join(","));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
