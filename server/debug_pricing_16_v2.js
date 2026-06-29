const { connectDB, sql } = require('./dbConfig');

async function debugPricing() {
    try {
        await connectDB();
        const requestNo = '16';
        console.log(`--- Debugging Pricing for Enquiry ${requestNo} ---`);

        // 1. Get Enquiry Details
        const enq = await sql.query`SELECT RequestNo, ProjectName, Status FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
        console.log('Enquiry:', JSON.stringify(enq.recordset[0]));

        // 2. Get EnquiryFor items (Lead Jobs)
        const items = await sql.query`SELECT ID, ParentID, ItemName, LeadJobCode FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        console.log('EnquiryFor Items count:', items.recordset.length);
        items.recordset.forEach(i => console.log('  Job:', JSON.stringify(i)));

        // 3. Get Pricing Options
        const options = await sql.query`SELECT ID, OptionName, ItemName, CustomerName, LeadJobName FROM EnquiryPricingOptions WHERE RequestNo = ${requestNo}`;
        console.log('Pricing Options count:', options.recordset.length);
        options.recordset.forEach(o => console.log('  Option:', JSON.stringify(o)));

        // 4. Get Pricing Values
        const pricing = await sql.query`SELECT OptionID, EnquiryForID, EnquiryForItem, Price, UpdatedBy, CustomerName FROM EnquiryPricingValues WHERE RequestNo = ${requestNo}`;
        console.log('Pricing Values count:', pricing.recordset.length);
        pricing.recordset.forEach(p => console.log('  Value:', JSON.stringify(p)));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugPricing();
