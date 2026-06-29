const { sql, connectDB } = require('./dbConfig');

async function checkPricing() {
    await connectDB();
    try {
        const res = await sql.query`SELECT * FROM EnquiryPricingValues WHERE RequestNo = '45'`;
        console.log('Pricing values for Enquiry 45:');
        console.log(JSON.stringify(res.recordset, null, 2));

        if (res.recordset.length === 0) {
            console.log('\nNO PRICING VALUES FOUND! This is why it shows as pending.');
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

checkPricing();
