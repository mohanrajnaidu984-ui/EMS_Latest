const sql = require('mssql');
require('dotenv').config();

(async () => {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('--- Enquiry 97 ---');
        const enq = await sql.query('SELECT RequestNo, CustomerName, ClientName, ConsultantName FROM EnquiryMaster WHERE RequestNo = 97');
        console.log(enq.recordset[0]);

        console.log('\n--- Existing Pricing Customers for 97 ---');
        const pricing = await sql.query('SELECT DISTINCT CustomerName FROM EnquiryPricingOptions WHERE RequestNo = 97');
        console.log(pricing.recordset);

        console.log('\n--- Master Customers Count ---');
        const count = await sql.query('SELECT COUNT(*) as count FROM CustomerMaster');
        console.log(count.recordset[0]);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
})();
