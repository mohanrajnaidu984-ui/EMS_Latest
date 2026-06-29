const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 30000
    }
};

const checkTata = async () => {
    try {
        await sql.connect(config);
        console.log('Connected to database...');

        console.log('\n--- Customers (TATA) ---');
        const custResult = await sql.query`SELECT * FROM Customers WHERE CompanyName LIKE '%TATA%'`;
        console.log(JSON.stringify(custResult.recordset, null, 2));

        console.log('\n--- Contacts (TATA) ---');
        const contResult = await sql.query`SELECT * FROM Contacts WHERE CompanyName LIKE '%TATA%'`;
        console.log(JSON.stringify(contResult.recordset, null, 2));

        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
};

checkTata();
