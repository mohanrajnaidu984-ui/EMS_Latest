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

async function createRequestedAdmin() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(config);

        const email = 'admin@almoayyedcg.com';
        const password = '123456'; // From user screenshot
        const hashedPassword = await bcrypt.hash(password, 10);

        console.log(`Checking for user: ${email}`);
        const result = await pool.request()
            .input('Email', sql.NVarChar, email)
            .query('SELECT * FROM Master_ConcernedSE WHERE EmailId = @Email');

        if (result.recordset.length > 0) {
            console.log('User exists. Updating password and roles...');
            await pool.request()
                .input('Email', sql.NVarChar, email)
                .input('Password', sql.NVarChar, hashedPassword)
                .query(`UPDATE Master_ConcernedSE SET LoginPassword = @Password, Roles = 'Admin', Status = 'Active' WHERE EmailId = @Email`);
            console.log('✅ User updated successfully.');
        } else {
            console.log('User does not exist. Creating new Admin user...');
            await pool.request()
                .input('FullName', sql.NVarChar, 'System Admin')
                .input('Designation', sql.NVarChar, 'Administrator')
                .input('Email', sql.NVarChar, email)
                .input('Password', sql.NVarChar, hashedPassword)
                .input('Status', sql.NVarChar, 'Active')
                .input('Department', sql.NVarChar, 'IT')
                .input('Roles', sql.NVarChar, 'Admin')
                .query(`
                    INSERT INTO Master_ConcernedSE (FullName, Designation, EmailId, LoginPassword, Status, Department, Roles)
                    VALUES (@FullName, @Designation, @Email, @Password, @Status, @Department, @Roles)
                `);
            console.log('✅ Admin user created successfully.');
        }

        await pool.close();
        process.exit(0);

    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

createRequestedAdmin();
