const sql = require('mssql');
require('dotenv').config();

async function run() {
    try {
        console.log('Connecting to DB...');
        await sql.connect(process.env.DB_CONNECTION_STRING);
        console.log('Connected.');

        console.log('\n--- EnquiryFor (Jobs) ---');
        const jobs = await sql.query("SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = '51'");
        console.log(JSON.stringify(jobs.recordset, null, 2));

        console.log('\n--- EnquiryPricingOptions ---');
        const options = await sql.query("SELECT ID, Name, ItemName, CustomerName FROM EnquiryPricingOptions WHERE RequestNo = '51'");
        console.log(JSON.stringify(options.recordset, null, 2));

        console.log('\n--- EnquiryPricingValues ---');
        // Join with Options to see context
        const values = await sql.query(`
            SELECT V.ID, V.OptionID, V.EnquiryForID, V.EnquiryForItem, V.Price, O.CustomerName 
            FROM EnquiryPricingValues V
            JOIN EnquiryPricingOptions O ON V.OptionID = O.ID
            WHERE V.RequestNo = '51'
        `);
        console.log(JSON.stringify(values.recordset, null, 2));

        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

run();
