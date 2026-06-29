const { connectDB, sql } = require('./dbConfig');

async function debugPricing() {
    try {
        await connectDB();
        const requestNo = '16';
        console.log(`--- Debugging Pricing for Enquiry ${requestNo} ---`);

        // 1. Get Enquiry Details
        const enq = await sql.query`SELECT * FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
        console.log('Enquiry:', enq.recordset[0]);

        // 2. Get EnquiryFor items (Lead Jobs)
        const items = await sql.query`SELECT * FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        console.log('EnquiryFor Items:', items.recordset);

        // 3. Get Pricing Data
        const pricing = await sql.query`SELECT * FROM EnquiryPricingValues WHERE RequestNo = ${requestNo}`;
        console.log('Pricing Values:', pricing.recordset);

        // 4. Get Pricing Options (if any)
        const options = await sql.query`SELECT * FROM EnquiryPricingOptions WHERE RequestNo = ${requestNo}`;
        console.log('Pricing Options:', options.recordset);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugPricing();
