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

async function findAndFixTypo() {
    try {
        await sql.connect(config);

        const typoEmail = 'vigneshgovadhan5163@gmail.com';
        const correctEmail = 'vigneshgovardhan5163@gmail.com';

        console.log(`Searching for typo: ${typoEmail}`);

        // Check Users
        const userRes = await sql.query`SELECT * FROM Users WHERE Email LIKE '%vigneshgovadhan5163%'`;
        if (userRes.recordset.length > 0) {
            console.log('Found typo in Users table:', userRes.recordset);
            await sql.query`UPDATE Users SET Email = ${correctEmail} WHERE Email = ${typoEmail}`;
            console.log('Fixed typo in Users table.');
        } else {
            console.log('No typo found in Users table.');
        }

        // Check Customers
        const custRes = await sql.query`SELECT * FROM Customers WHERE Email LIKE '%vigneshgovadhan5163%'`;
        if (custRes.recordset.length > 0) {
            console.log('Found typo in Customers table:', custRes.recordset);
            await sql.query`UPDATE Customers SET Email = ${correctEmail} WHERE Email = ${typoEmail}`;
            console.log('Fixed typo in Customers table.');
        } else {
            console.log('No typo found in Customers table.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

findAndFixTypo();
