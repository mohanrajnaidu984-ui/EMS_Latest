
const sql = require('mssql');
require('dotenv').config({ path: './.env' });

async function checkEnquiry() {
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

        console.log('--- Enquiry 17 ---');
        const enq = await sql.query`SELECT RequestNo, ProjectName, CustomerName FROM EnquiryMaster WHERE RequestNo = 17`;
        console.table(enq.recordset);

        console.log('--- All Pricing Options for Enquiry 17 ---');
        const opts = await sql.query`SELECT TOP 10 id, OptionName, itemName, customerName FROM EnquiryPricingOptions WHERE RequestNo = 17`;
        console.table(opts.recordset);

        console.log('--- Search for Nass ---');
        const nass = await sql.query`SELECT DISTINCT CustomerName FROM EnquiryPricingOptions WHERE CustomerName LIKE '%Nass%'`;
        console.table(nass.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkEnquiry();
