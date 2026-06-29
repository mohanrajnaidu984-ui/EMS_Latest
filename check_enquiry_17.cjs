const { sql, connectDB } = require('./server/dbConfig');

async function check() {
    try {
        await connectDB();
        const res = await sql.query("SELECT RequestNo, EnquiryDate, Status, CustomerPreferredPrice, WonOrderValue FROM EnquiryMaster WHERE LTRIM(RTRIM(RequestNo)) = '17'");
        console.log("Enquiry 17 Details:", JSON.stringify(res.recordset, null, 2));

        const efRes = await sql.query("SELECT * FROM EnquiryFor WHERE LTRIM(RTRIM(RequestNo)) = '17'");
        console.log("EnquiryFor for 17:", JSON.stringify(efRes.recordset, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
