const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        await sql.connect(config);
        const result = await sql.query`SELECT ItemName FROM EnquiryFor WHERE RequestNo = '102' ORDER BY ID ASC`;
        console.log('Divisions Order:', result.recordset.map(r => r.ItemName));
    } catch (err) { console.error(err); } finally { await sql.close(); }
}
run();
