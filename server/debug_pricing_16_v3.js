const { connectDB, sql } = require('./dbConfig');
const fs = require('fs');

async function debugPricing() {
    try {
        await connectDB();
        const requestNo = '16';
        const data = {};

        const enq = await sql.query`SELECT RequestNo, ProjectName, Status FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
        data.Enquiry = enq.recordset[0];

        const items = await sql.query`SELECT ID, ParentID, ItemName, LeadJobCode FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        data.Jobs = items.recordset;

        const options = await sql.query`SELECT ID, OptionName, ItemName, CustomerName, LeadJobName FROM EnquiryPricingOptions WHERE RequestNo = ${requestNo}`;
        data.Options = options.recordset;

        const pricing = await sql.query`SELECT OptionID, EnquiryForID, EnquiryForItem, Price, UpdatedBy, CustomerName, LeadJobName FROM EnquiryPricingValues WHERE RequestNo = ${requestNo}`;
        data.Values = pricing.recordset;

        fs.writeFileSync('pricing_debug_data.json', JSON.stringify(data, null, 2), 'utf8');
        console.log('Data written to pricing_debug_data.json');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugPricing();
