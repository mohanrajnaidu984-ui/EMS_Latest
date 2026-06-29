
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

async function updateSchema() {
    try {
        await sql.connect(config);
        console.log('Connected to database...');

        const columns = [
            { name: 'QuoteDate', type: 'DATETIME' },
            { name: 'CustomerReference', type: 'NVARCHAR(255)' },
            { name: 'Subject', type: 'NVARCHAR(MAX)' },
            { name: 'Signatory', type: 'NVARCHAR(255)' },
            { name: 'SignatoryDesignation', type: 'NVARCHAR(255)' }, // If user is selected, designation is fetched? Stores snapshot?
            { name: 'ToName', type: 'NVARCHAR(255)' },
            { name: 'ToAddress', type: 'NVARCHAR(MAX)' }
        ];

        for (const col of columns) {
            const checkQuery = `
                IF COL_LENGTH('EnquiryQuotes', '${col.name}') IS NULL
                BEGIN
                    ALTER TABLE EnquiryQuotes ADD ${col.name} ${col.type};
                    PRINT 'Added column ${col.name}';
                END
                ELSE
                BEGIN
                    PRINT 'Column ${col.name} already exists';
                END
            `;
            await sql.query(checkQuery);
        }

        console.log('Schema update complete.');
    } catch (err) {
        console.error('Error updating schema:', err);
    } finally {
        await sql.close();
    }
}

updateSchema();
