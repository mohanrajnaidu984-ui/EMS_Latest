const { sql, connectDB } = require('./dbConfig');

async function testAllDates() {
    await connectDB();
    const request = new sql.Request();
    const result = await request.query("SELECT RequestNo, CONVERT(VARCHAR, EnquiryDate, 120) as StrDate, EnquiryDate as RawDate FROM EnquiryMaster");
    console.table(result.recordset);
    process.exit(0);
}
testAllDates();
