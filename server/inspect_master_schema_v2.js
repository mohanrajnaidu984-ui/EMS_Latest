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

        const result = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Master_EnquiryFor'
        `;
        console.log('--- COLUMNS ---');
        result.recordset.forEach(r => console.log(r.COLUMN_NAME));

        console.log('--- DATA ---');
        const data = await sql.query`
            SELECT TOP 2 ItemName, DivisionCode, DepartmentCode
            FROM Master_EnquiryFor
        `;
        console.log(JSON.stringify(data.recordset, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

run();
