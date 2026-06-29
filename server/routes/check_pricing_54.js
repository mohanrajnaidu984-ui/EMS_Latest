require('dotenv').config();
const { sql, connectDB } = require('../dbConfig');

async function checkPricing() {
    try {
        await connectDB();
        const result = await new sql.Request().query(`
      SELECT po.CustomerName, po.ItemName, pv.Price
      FROM EnquiryPricingOptions po
      JOIN EnquiryPricingValues pv ON po.ID = pv.OptionID
      WHERE po.RequestNo = '54'
    `);
        console.log('Pricing for Enquiry 54:');
        console.log(JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkPricing();
