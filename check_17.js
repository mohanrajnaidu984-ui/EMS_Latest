const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function check() {
    try {
        await sql.connect(config);
        const reqNo = '17';
        console.log(`--- Jobs for Enquiry ${reqNo} ---`);
        const jobs = await sql.query`SELECT ID, ParentID, ItemName, LeadJobCode FROM EnquiryFor WHERE RequestNo = ${reqNo}`;
        console.table(jobs.recordset);

        console.log(`\n--- Prices for Enquiry ${reqNo} ---`);
        const prices = await sql.query`SELECT EnquiryForID, EnquiryForItem, Price, OptionID FROM EnquiryPricingValues WHERE RequestNo = ${reqNo}`;
        console.table(prices.recordset);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
