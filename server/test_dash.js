const { sql, connectDB } = require('./dbConfig');

async function testDash() {
    await connectDB();
    const request = new sql.Request();
    const result = await request.query(`SELECT EnquiryDate, CONVERT(VARCHAR(10), EnquiryDate, 23) as ConvEnquiryDate FROM EnquiryMaster WHERE RequestNo='11'`);
    console.table(result.recordset);
    process.exit(0);
}
testDash();
