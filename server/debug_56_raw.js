
const { connectDB, sql } = require('./dbConfig');

async function debugEnquiry56() {
    try {
        await connectDB();

        // 1. Fetch Enquiry Items (Structure)
        const items = await sql.query`SELECT * FROM EnquiryFor WHERE RequestNo = '56'`;
        console.log('--- ENQUIRY ITEMS (Structure) ---');
        console.log(JSON.stringify(items.recordset, null, 2));

        // 2. Fetch Options/Pricing
        const options = await sql.query`SELECT * FROM EnquiryQuotationOptions WHERE RequestNo = '56'`;
        console.log('\n--- OPTIONS ---');
        console.log(JSON.stringify(options.recordset, null, 2));

        // 3. Fetch Values
        const values = await sql.query`SELECT * FROM EnquiryQuotationValues WHERE RequestNo = '56'`;
        console.log('\n--- VALUES ---');
        console.log(JSON.stringify(values.recordset, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugEnquiry56();
