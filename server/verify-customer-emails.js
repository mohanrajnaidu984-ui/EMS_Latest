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

async function verifyCustomerEmails() {
    try {
        await sql.connect(config);
        const customers = ['TCS', 'Infosys'];
        for (const cust of customers) {
            const res = await sql.query`SELECT CompanyName, Email FROM Customers WHERE CompanyName = ${cust}`;
            console.log(`Customer: ${cust}`, res.recordset);
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

verifyCustomerEmails();
