
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

async function checkCols() {
    try {
        await sql.connect(config);
        const res = await sql.query`SELECT TOP 1 * FROM Master_EnquiryFor`;
        console.log(JSON.stringify(Object.keys(res.recordset[0])));
        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

checkCols();
