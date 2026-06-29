const sql = require('mssql');
require('dotenv').config();

async function checkOptions() {
    try {
        await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: { encrypt: false, trustServerCertificate: true }
        });

        const res = await sql.query`
            SELECT ID, OptionName, ItemName, CustomerName 
            FROM EnquiryPricingOptions 
            WHERE RequestNo = '43'
        `;
        console.log('Pricing Options for Enquiry 43:', JSON.stringify(res.recordset, null, 2));

        const res2 = await sql.query`
            SELECT OptionID, EnquiryForItem, Price 
            FROM EnquiryPricingValues 
            WHERE RequestNo = '43'
        `;
        console.log('Pricing Values for Enquiry 43:', JSON.stringify(res2.recordset, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        sql.close();
    }
}

checkOptions();
