const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryPricingValues'");
        for (const c of res.recordset) {
            console.log("COL:" + c.COLUMN_NAME);
        }
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
