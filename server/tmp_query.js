const { connectDB, sql } = require('./dbConfig');

async function run() {
    try {
        await connectDB();
        const res = await sql.query(`SELECT CustomerRefNo, RequestNo FROM EnquiryMaster WHERE RequestNo='18'`);
        console.table(res.recordset);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
run();
