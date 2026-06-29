const { sql, connectDB } = require('./dbConfig');
async function run() {
    await connectDB();
    const request = new sql.Request();
    const result = await request.query(`SELECT RequestNo, EnquiryDate, DueDate, SiteVisitDate, Status FROM EnquiryMaster WHERE RequestNo='11'`);
    console.table(result.recordset);
    process.exit(0);
}
run();
