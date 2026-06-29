const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected to DB');

        // Check if columns exist
        const checkQuery = `
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryItems' AND COLUMN_NAME IN ('CompanyName', 'DepartmentName')
        `;
        const result = await sql.query(checkQuery);
        const existingColumns = result.recordset.map(r => r.COLUMN_NAME);

        if (!existingColumns.includes('CompanyName')) {
            console.log('Adding CompanyName column...');
            await sql.query`ALTER TABLE EnquiryItems ADD CompanyName NVARCHAR(255)`;
        } else {
            console.log('CompanyName column already exists.');
        }

        if (!existingColumns.includes('DepartmentName')) {
            console.log('Adding DepartmentName column...');
            await sql.query`ALTER TABLE EnquiryItems ADD DepartmentName NVARCHAR(100)`;
        } else {
            console.log('DepartmentName column already exists.');
        }

        console.log('Schema update complete.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

run();
