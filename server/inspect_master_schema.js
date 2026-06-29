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

async function run() {
    try {
        await sql.connect(config);

        // Get column names for Master_EnquiryFor
        const result = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Master_EnquiryFor'
        `;

        console.log('Columns in Master_EnquiryFor:', result.recordset.map(r => r.COLUMN_NAME));

        // Let's also see what the row for 'Plumbing & FF' and 'L1 - Civil Project' looks like
        const data = await sql.query`
            SELECT * FROM Master_EnquiryFor 
            WHERE ItemName IN ('Plumbing & FF', 'L1 - Civil Project')
        `;
        console.log('Sample Data:', JSON.stringify(data.recordset, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

run();
