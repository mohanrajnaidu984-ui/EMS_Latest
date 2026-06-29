
const sql = require('mssql');
require('dotenv').config({ path: './.env' });

async function checkPricing() {
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

        console.log('--- Pricing Options for Enquiry 17 & Nass Contracting ---');
        const optionsQuery = `
            SELECT id, OptionName, itemName, customerName, leadJobName 
            FROM EnquiryPricingOptions 
            WHERE RequestNo = 17 AND (customerName = 'Nass Contracting' OR customerName IS NULL OR customerName = 'Main')
        `;
        const options = await sql.query(optionsQuery);
        console.table(options.recordset);

        console.log('--- Pricing Values for Enquiry 17 & Nass Contracting ---');
        const valuesQuery = `
            SELECT v.OptionID, v.Price, v.CustomerName, o.OptionName, o.itemName, o.leadJobName
            FROM EnquiryPricingValues v
            JOIN EnquiryPricingOptions o ON v.OptionID = o.id
            WHERE o.RequestNo = 17 AND (v.CustomerName = 'Nass Contracting' OR v.CustomerName = 'Main')
            AND o.OptionName = 'Civil Project'
        `;
        const values = await sql.query(valuesQuery);
        console.table(values.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkPricing();
