
const { connectDB, sql } = require('./dbConfig');

async function debugEnquiry56() {
    try {
        await connectDB();

        // 1. Fetch Enquiry Items
        const items = await sql.query`SELECT ID, ParentID, ItemName, LeadJobCode FROM EnquiryFor WHERE RequestNo = '56'`;
        console.log('--- ENQUIRY ITEMS ---');
        console.log(JSON.stringify(items.recordset, null, 2));

        // 2. Fetch Pricing Values
        const values = await sql.query`SELECT * FROM EnquiryPricingValues WHERE RequestNo = '56'`;
        console.log('\n--- PRICING VALUES ---');
        console.log(JSON.stringify(values.recordset, null, 2));

        // 3. Fetch Options
        const options = await sql.query`SELECT * FROM EnquiryPricingOptions WHERE RequestNo = '56'`;
        console.log('\n--- PRICING OPTIONS ---');
        console.log(JSON.stringify(options.recordset, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugEnquiry56();
