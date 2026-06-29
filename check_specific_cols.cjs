const { sql, connectDB } = require('./server/dbConfig');

async function check() {
    try {
        await connectDB();
        const res = await sql.query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryMaster' AND COLUMN_NAME IN ('WonOrderValue', 'LostCompetitorPrice', 'CustomerPreferredPrice')");
        console.log(res.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
