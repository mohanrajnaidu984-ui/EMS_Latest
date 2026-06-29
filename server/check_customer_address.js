
const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'server', '.env') });
const dbConfig = require('./server/dbConfig');

async function checkCustomer() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT CompanyName, Address1, Address2 FROM Master_CustomerName WHERE CompanyName LIKE '%Kooheji%'`;
        console.log(JSON.stringify(result.recordset, null, 2));
        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkCustomer();
