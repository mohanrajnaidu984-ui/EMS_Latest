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

const checkContacts = async () => {
    try {
        await sql.connect(config);
        console.log('Connected to database...');

        const result = await sql.query`SELECT * FROM Contacts ORDER BY ContactID DESC`;
        console.log(JSON.stringify(result.recordset, null, 2));

        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
};

checkContacts();
