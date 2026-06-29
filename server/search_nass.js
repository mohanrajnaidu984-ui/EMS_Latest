
const sql = require('mssql');
require('dotenv').config({ path: './.env' });

async function searchPricing() {
    const config = {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE,
        options: {
            encrypt: false,
            trustServerCertificate: true
        }
    };

    try {
        await sql.connect(config);

        console.log('--- Searching for Nass in EnquiryPricingValues ---');
        const res = await sql.query`SELECT * FROM EnquiryPricingValues WHERE CustomerName LIKE '%Nass%'`;
        console.table(res.recordset);

        if (res.recordset.length > 0) {
            const reqNo = res.recordset[0].RequestNo;
            console.log(`--- Pricing Options for Enquiry ${reqNo} ---`);
            const opts = await sql.query`SELECT id, OptionName, itemName, customerName, leadJobName FROM EnquiryPricingOptions WHERE RequestNo = ${reqNo}`;
            console.table(opts.recordset);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

searchPricing();
