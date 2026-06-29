require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

async function debugEnquiry54() {
    try {
        await connectDB();
        const masterRes = await new sql.Request().query(`SELECT RequestNo, Status FROM EnquiryMaster WHERE RequestNo = '54'`);
        console.log('Enquiry Status:', masterRes.recordset[0].Status);

        const pricesRes = await new sql.Request().query(`SELECT Price FROM EnquiryPricingValues WHERE RequestNo = '54'`);
        console.log('Pricing Count:', pricesRes.recordset.length);
        console.log('Prices:', pricesRes.recordset.map(p => p.Price));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
debugEnquiry54();
