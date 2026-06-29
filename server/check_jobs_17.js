const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: { encrypt: true, trustServerCertificate: true }
};

async function check() {
    await sql.connect(config);
    const res = await sql.query`SELECT ID, ParentID, ItemName, LeadJobCode FROM EnquiryFor WHERE RequestNo = '17'`;
    console.table(res.recordset);
    process.exit(0);
}
check();
