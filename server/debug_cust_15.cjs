const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
};

async function run() {
    await sql.connect(config);

    console.log('\n=== EnquiryMaster for RequestNo=15 ===');
    const r1 = await sql.query`SELECT CustomerName, ReceivedFrom FROM EnquiryMaster WHERE RequestNo = 15`;
    r1.recordset.forEach(r => console.log('Master CustomerName:', JSON.stringify(r.CustomerName)));

    console.log('\n=== EnquiryCustomer for RequestNo=15 ===');
    const r2 = await sql.query`SELECT CustomerName FROM EnquiryCustomer WHERE RequestNo = 15`;
    r2.recordset.forEach(r => console.log('EnquiryCustomer:', JSON.stringify(r.CustomerName)));

    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
