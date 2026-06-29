const sql = require('mssql');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 30000,
        requestTimeout: 30000,
        enableArithAbort: true
    }
};

async function setAdmin() {
    try {
        await sql.connect(config);
        const email = 'mohan.naid@almoayyedcg.com';

        // Check if user exists
        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;

        if (result.recordset.length > 0) {
            console.log('User exists. Updating to Admin...');
            await sql.query`UPDATE Master_ConcernedSE SET Roles = 'Admin' WHERE EmailId = ${email}`;
            console.log('✅ User updated to Admin.');
        } else {
            console.log('User does not exist. Creating Admin user...');
            const hashedPassword = await bcrypt.hash('123456', 10);
            await sql.query`
                INSERT INTO Master_ConcernedSE (FullName, Designation, EmailId, LoginPassword, Status, Department, Roles)
                VALUES ('Mohan Naidu', 'Admin', ${email}, ${hashedPassword}, 'Active', 'Management', 'Admin')
            `;
            console.log('✅ User created as Admin.');
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

setAdmin();
