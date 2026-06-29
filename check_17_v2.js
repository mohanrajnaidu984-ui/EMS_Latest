const { sql, connectDB } = require('./server/dbConfig');

async function check() {
    try {
        await connectDB();
        const reqNo = '17';
        console.log(`--- Jobs for Enquiry ${reqNo} ---`);
        const jobs = await sql.query`SELECT ID, ParentID, ItemName, LeadJobCode FROM EnquiryFor WHERE RequestNo = ${reqNo}`;
        console.table(jobs.recordset);

        console.log(`\n--- Prices for Enquiry ${reqNo} ---`);
        const prices = await sql.query`SELECT EnquiryForID, EnquiryForItem, Price, OptionID FROM EnquiryPricingValues WHERE RequestNo = ${reqNo}`;
        console.table(prices.recordset);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
