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

const addColumn = async () => {
    try {
        await sql.connect(config);
        console.log('Connected to database...');

        // Check if column exists
        const checkResult = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryAttachments' AND COLUMN_NAME = 'UploadedAt'
        `;

        if (checkResult.recordset.length === 0) {
            console.log('Adding UploadedAt column...');
            await sql.query`ALTER TABLE EnquiryAttachments ADD UploadedAt DATETIME DEFAULT GETDATE()`;
            console.log('✅ UploadedAt column added successfully.');
        } else {
            console.log('ℹ️ UploadedAt column already exists.');
        }

        await sql.close();
    } catch (err) {
        console.error('❌ Error updating schema:', err);
    }
};

addColumn();
