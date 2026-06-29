const { sql, connectDB } = require('./server/dbConfig');

async function check() {
    try {
        await connectDB();

        const res = await sql.query("SELECT RequestNo, ProjectName, WonCustomerName, WonOrderValue, Status FROM EnquiryMaster WHERE RequestNo = '13'");
        console.log("Enquiry 13 Full Details:");
        for (const row of res.recordset) {
            console.log("RequestNo:", row.RequestNo);
            console.log("ProjectName:", row.ProjectName);
            console.log("WonCustomerName:", row.WonCustomerName);
            console.log("WonOrderValue:", row.WonOrderValue);
            console.log("Status:", row.Status);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
