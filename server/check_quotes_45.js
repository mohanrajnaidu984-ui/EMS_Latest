const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const config = {
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
    options: { encrypt: false, trustServerCertificate: true }
};
async function check() {
    await sql.connect(config);
    const q = await sql.query("SELECT QuoteNumber, ToName FROM EnquiryQuotes WHERE RequestNo = '45'");
    console.log('Quotes for 45:', JSON.stringify(q.recordset, null, 2));

    const mef = await sql.query("SELECT ItemName, DivisionCode, CommonMailIds FROM Master_EnquiryFor WHERE ItemName LIKE '%Electrical%'");
    console.log('Master Electrical:', JSON.stringify(mef.recordset, null, 2));

    process.exit(0);
}
check();
