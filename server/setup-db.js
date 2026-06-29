const sql = require('mssql');
const fs = require('fs');
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

async function setupDatabase() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(config);
        console.log('Connected!');

        // Read schema file
        const schemaPath = path.join(__dirname, '../EMS_DB.sql');
        console.log(`Reading schema from: ${schemaPath}`);
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        // Split by 'GO' command as mssql driver doesn't support it directly in one go usually, 
        // but EMS_DB.sql doesn't seem to have GOs inside the main blocks, mostly standard SQL.
        // However, it's safer to execute blocks. 
        // Looking at EMS_DB.sql content provided earlier, it doesn't use GO.
        // It uses IF NOT EXISTS checks. So we can probably run it as a whole batch or split by semi-colons if needed.
        // Let's try running it as a whole first, if it fails we split.

        console.log('Executing schema script...');
        await pool.request().query(schemaSql);
        console.log('Schema applied successfully!');

        // Seed Default User
        console.log('Checking for existing users...');
        const userCheck = await pool.request().query("SELECT * FROM Master_ConcernedSE WHERE EmailId = 'admin@example.com'");

        if (userCheck.recordset.length === 0) {
            console.log('Creating default admin user...');
            const hashedPassword = await bcrypt.hash('password123', 10);

            await pool.request()
                .input('FullName', sql.NVarChar, 'System Admin')
                .input('Designation', sql.NVarChar, 'Administrator')
                .input('EmailId', sql.NVarChar, 'admin@example.com')
                .input('LoginPassword', sql.NVarChar, hashedPassword)
                .input('Status', sql.NVarChar, 'Active')
                .input('Department', sql.NVarChar, 'IT')
                .input('Roles', sql.NVarChar, 'Admin')
                .query(`
                    INSERT INTO Master_ConcernedSE (FullName, Designation, EmailId, LoginPassword, Status, Department, Roles)
                    VALUES (@FullName, @Designation, @EmailId, @LoginPassword, @Status, @Department, @Roles)
                `);
            console.log('Default user created: admin@example.com / password123');
        } else {
            console.log('Default user already exists.');
        }

        await pool.close();
        console.log('Database setup complete.');
        process.exit(0);

    } catch (err) {
        console.error('Error setting up database:', err);
        process.exit(1);
    }
}

setupDatabase();
