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

    console.log('\n=== ReceivedFrom for RequestNo=15 ===');
    const r = await sql.query`SELECT ContactName, CompanyName FROM ReceivedFrom WHERE RequestNo = 15`;
    r.recordset.forEach(r => console.log('ReceivedFrom:', JSON.stringify(r.ContactName), '| Company:', JSON.stringify(r.CompanyName)));

    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
