const { sql, connectDB } = require('./server/dbConfig');

async function check() {
    try {
        await connectDB();

        // Check column names
        const cols = await sql.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryMaster' AND COLUMN_NAME LIKE '%Customer%'");
        console.log("Customer-related columns:", cols.recordset);

        // Check enquiry 17
        const res = await sql.query("SELECT RequestNo, Status, CustomerPreferredPrice FROM EnquiryMaster WHERE LTRIM(RTRIM(RequestNo)) = '17'");
        console.log("\nEnquiry 17:", res.recordset);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
