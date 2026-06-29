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
        const res = await sql.query`SELECT ID, ItemName, LeadJobCode FROM EnquiryFor WHERE RequestNo = '16'`;
        console.table(res.recordset);
        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

checkPricing();
