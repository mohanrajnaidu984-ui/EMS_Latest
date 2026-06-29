const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function debug() {
    try {
        await sql.connect(config);
        const result = await sql.query`SELECT ID, QuoteNumber, ToName, Status, RevisionNo, PreparedBy, PreparedByEmail FROM EnquiryQuotes WHERE RequestNo = '51'`;
        console.log('DEBUG_START');
        console.log(JSON.stringify(result.recordset, null, 2));
        console.log('DEBUG_END');
        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

debug();
