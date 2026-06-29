const { connectDB, sql } = require('./dbConfig');

async function checkEnquiryForLeadJobCodes() {
    try {
        await connectDB();
        const requestNo = '50';

        console.log(`\n--- ENQUIRY 50 LeadJobCodes ---`);
        const result = await sql.query`
            SELECT ID, ItemName, ParentID, LeadJobCode
            FROM EnquiryFor 
            WHERE RequestNo = ${requestNo}
        `;
        console.log(JSON.stringify(result.recordset, null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkEnquiryForLeadJobCodes();
