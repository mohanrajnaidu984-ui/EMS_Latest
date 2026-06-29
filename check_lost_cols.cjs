const { sql, connectDB } = require('./server/dbConfig');

async function check() {
    try {
        await connectDB();
        const res = await sql.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryMaster' AND COLUMN_NAME LIKE 'Lost%'");
        console.log("Lost columns:", res.recordset.map(r => r.COLUMN_NAME));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
