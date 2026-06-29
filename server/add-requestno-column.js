const sql = require('mssql');
const path = require('path');
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

async function addRequestNoColumn() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(config);
        console.log('Connected!');

        // Add RequestNo column to Master_CustomerName if it doesn't exist
        console.log('Checking Master_CustomerName...');
        const customerCheck = await pool.request().query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Master_CustomerName' AND COLUMN_NAME = 'RequestNo'
        `);

        if (customerCheck.recordset.length === 0) {
            console.log('Adding RequestNo column to Master_CustomerName...');
            await pool.request().query(`
                ALTER TABLE Master_CustomerName 
                ADD RequestNo NVARCHAR(50) NULL
            `);
            console.log('✅ Added RequestNo to Master_CustomerName');
        } else {
            console.log('✅ RequestNo already exists in Master_CustomerName');
        }

        // Add RequestNo column to Master_ClientName if it doesn't exist
        console.log('Checking Master_ClientName...');
        const clientCheck = await pool.request().query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Master_ClientName' AND COLUMN_NAME = 'RequestNo'
        `);

        if (clientCheck.recordset.length === 0) {
            console.log('Adding RequestNo column to Master_ClientName...');
            await pool.request().query(`
                ALTER TABLE Master_ClientName 
                ADD RequestNo NVARCHAR(50) NULL
            `);
            console.log('✅ Added RequestNo to Master_ClientName');
        } else {
            console.log('✅ RequestNo already exists in Master_ClientName');
        }

        // Add RequestNo column to Master_ConsultantName if it doesn't exist
        console.log('Checking Master_ConsultantName...');
        const consultantCheck = await pool.request().query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Master_ConsultantName' AND COLUMN_NAME = 'RequestNo'
        `);

        if (consultantCheck.recordset.length === 0) {
            console.log('Adding RequestNo column to Master_ConsultantName...');
            await pool.request().query(`
                ALTER TABLE Master_ConsultantName 
                ADD RequestNo NVARCHAR(50) NULL
            `);
            console.log('✅ Added RequestNo to Master_ConsultantName');
        } else {
            console.log('✅ RequestNo already exists in Master_ConsultantName');
        }

        console.log('\n✅ All columns updated successfully!');
        await pool.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

addRequestNoColumn();
