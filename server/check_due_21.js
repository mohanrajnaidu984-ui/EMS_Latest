const { connectDB, sql } = require('./dbConfig');

async function checkAnyEnquiry21() {
    try {
        await connectDB();
        const result = await sql.query`SELECT RequestNo, DueDate FROM EnquiryMaster WHERE CAST(DueDate AS DATE) = '2026-02-21'`;
        console.log('Enquiries Due on Feb 21:', result.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkAnyEnquiry21();
