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

async function verifyContacts() {
    try {
        await sql.connect(config);
        console.log('Connected to database.');

        // Check Customers
        const customers = await sql.query`SELECT CompanyName FROM Customers`;
        console.log('Customers:', customers.recordset.map(c => c.CompanyName));

        // Check Contacts
        const contacts = await sql.query`SELECT ContactName, CompanyName FROM Contacts`;
        console.log('Contacts:', contacts.recordset);

        // Check for mismatches
        const customerNames = customers.recordset.map(c => c.CompanyName);
        const orphanedContacts = contacts.recordset.filter(c => !customerNames.includes(c.CompanyName));

        if (orphanedContacts.length > 0) {
            console.log('WARNING: The following contacts have CompanyNames that do not exist in the Customers table:', orphanedContacts);
        } else {
            console.log('All contacts are linked to valid customers.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

verifyContacts();
