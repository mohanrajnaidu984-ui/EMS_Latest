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

// Mock data from frontend + user's data
const storedUsers = [
    { FullName: "SE1 - John Doe", Designation: "Sales Engineer", EmailId: "se1@comp.com", LoginPassword: "password123", Status: "Active", Department: "Sales", Roles: "Enquiry,Quotation" },
    { FullName: "SE2 - Jane Smith", Designation: "Sales Manager", EmailId: "se2@comp.com", LoginPassword: "password123", Status: "Active", Department: "Sales", Roles: "Enquiry,Admin" },
    { FullName: "Lakshman", Designation: "Sales", EmailId: "bmselveng1@almoayyedcg.com", LoginPassword: "121344", Status: "Active", Department: "MEP", Roles: "Enquiry" }
];

async function seedUsers() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(config);
        console.log('Connected!');

        // First check what exists
        console.log('\n=== Current Users ===');
        const existing = await pool.request().query(`SELECT ID, FullName, Designation, EmailId, Status, Department, Roles FROM Master_ConcernedSE`);
        console.log(`Count: ${existing.recordset.length}`);
        if (existing.recordset.length > 0) {
            console.table(existing.recordset);
        }

        // Seed users
        for (const user of storedUsers) {
            const { FullName, Designation, EmailId, LoginPassword, Status, Department, Roles } = user;

            // Check if user already exists
            const checkQuery = `SELECT * FROM Master_ConcernedSE WHERE EmailId = @EmailId`;
            const existingUser = await pool.request()
                .input('EmailId', sql.NVarChar, EmailId)
                .query(checkQuery);

            if (existingUser.recordset.length === 0) {
                console.log(`Adding ${FullName}...`);

                // Hash password
                const hashedPassword = await bcrypt.hash(LoginPassword, 10);

                const insertQuery = `
                    INSERT INTO Master_ConcernedSE (FullName, Designation, EmailId, LoginPassword, Status, Department, Roles)
                    VALUES (@FullName, @Designation, @EmailId, @LoginPassword, @Status, @Department, @Roles)
                `;
                await pool.request()
                    .input('FullName', sql.NVarChar, FullName || '')
                    .input('Designation', sql.NVarChar, Designation || '')
                    .input('EmailId', sql.NVarChar, EmailId || '')
                    .input('LoginPassword', sql.NVarChar, hashedPassword)
                    .input('Status', sql.NVarChar, Status || 'Active')
                    .input('Department', sql.NVarChar, Department || '')
                    .input('Roles', sql.NVarChar, Roles || '')
                    .query(insertQuery);
                console.log(`✅ Added ${FullName}`);
            } else {
                console.log(`⏭️  ${FullName} already exists, skipping`);
            }
        }

        console.log('\n✅ User seeding complete!');

        // Show final state
        console.log('\n=== Final Users ===');
        const final = await pool.request().query(`SELECT ID, FullName, Designation, EmailId, Status, Department, Roles FROM Master_ConcernedSE`);
        console.log(`Count: ${final.recordset.length}`);
        console.table(final.recordset);

        await pool.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

seedUsers();
