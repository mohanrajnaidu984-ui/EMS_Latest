const { connectDB, sql } = require('./dbConfig');

async function checkEnquiryForLeadJobCodes() {
    try {
        await connectDB();
        const requestNo = '50';

        console.log(`\n--- ENQUIRY 50 LeadJobCodes ---`);
        const result = await sql.query`
            SELECT ID, ItemName, LeadJobCode
            FROM EnquiryFor 
            WHERE RequestNo = ${requestNo}
        `;

        for (const row of result.recordset) {
            console.log(`ID: ${row.ID}, Item: "${row.ItemName}", LeadJobCode: "${row.LeadJobCode}"`);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkEnquiryForLeadJobCodes();
