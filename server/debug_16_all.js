const sql = require('mssql');
require('dotenv').config();

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

async function checkPricing() {
    try {
        await sql.connect(config);
        const res = await sql.query`SELECT * FROM EnquiryPricingOptions WHERE RequestNo = '16'`;
        console.log(JSON.stringify(res.recordset, null, 2));
        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

checkPricing();
