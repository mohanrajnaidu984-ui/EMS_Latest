const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

async function inspectPricing() {
    try {
        await connectDB();

        const pricingValues = await sql.query`SELECT * FROM EnquiryPricingValues WHERE RequestNo = '97'`;
        const pricingOptions = await sql.query`SELECT * FROM EnquiryPricingOptions WHERE RequestNo = '97'`;

        const data = {
            EnquiryPricingValues: pricingValues.recordset,
            EnquiryPricingOptions: pricingOptions.recordset
        };

        fs.writeFileSync('inspect_pricing_97.json', JSON.stringify(data, null, 2));
        console.log('Pricing data written to inspect_pricing_97.json');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

inspectPricing();
