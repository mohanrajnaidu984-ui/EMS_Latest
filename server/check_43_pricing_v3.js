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
        console.log('--- OPTIONS ---');
        res.recordset.forEach(r => console.log(JSON.stringify(r)));

        const res2 = await sql.query`
            SELECT OptionID, EnquiryForItem, Price 
            FROM EnquiryPricingValues 
            WHERE RequestNo = '43'
        `;
        console.log('--- VALUES ---');
        res2.recordset.forEach(r => console.log(JSON.stringify(r)));
    } catch (err) {
        console.error(err);
    } finally {
        sql.close();
    }
}

checkOptions();
