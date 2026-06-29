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

const checkColumns = async () => {
    try {
        await sql.connect(config);
        console.log('Connected to database...');

        const result = await sql.query`
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME IN ('Customers', 'Contacts')
            ORDER BY TABLE_NAME, COLUMN_NAME
        `;

        const fs = require('fs');
        fs.writeFileSync('columns.json', JSON.stringify(result.recordset, null, 2));
        console.log('Columns written to columns.json');

        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
};

checkColumns();
