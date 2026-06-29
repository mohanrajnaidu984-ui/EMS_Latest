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

const checkData = async () => {
    try {
        await sql.connect(config);
        console.log('Connected to database...');

        const tables = ['Customers', 'Contacts', 'Users', 'EnquiryItems', 'Enquiries', 'EnquiryAttachments'];

        for (const table of tables) {
            console.log(`\n--- ${table} ---`);
            const countResult = await sql.query(`SELECT COUNT(*) as count FROM ${table}`);
            console.log(`Total Records: ${countResult.recordset[0].count}`);

            const topResult = await sql.query(`SELECT TOP 5 * FROM ${table} ORDER BY 1 DESC`);
            if (topResult.recordset.length > 0) {
                console.table(topResult.recordset);
            } else {
                console.log('No records found.');
            }
        }

        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
};

checkData();
