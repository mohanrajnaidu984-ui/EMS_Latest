const { sql, connectDB } = require('./server/dbConfig');

async function check() {
    try {
        await connectDB();
        const res = await sql.query("SELECT RequestNo, EnquiryDate, Status, LostCompetitorPrice, LostDate, WonOrderValue FROM EnquiryMaster WHERE LTRIM(RTRIM(RequestNo)) = '15'");
        console.log("Enquiry 15 Details:", JSON.stringify(res.recordset, null, 2));

        const efRes = await sql.query("SELECT * FROM EnquiryFor WHERE LTRIM(RTRIM(RequestNo)) = '15'");
        console.log("EnquiryFor for 15:", JSON.stringify(efRes.recordset, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
