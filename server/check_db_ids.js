const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function checkIds() {
    try {
        await sql.connect(config);
        const result = await sql.query`SELECT TOP 10 ID, FullName FROM Master_ConcernedSE`;
        console.log('User IDs in DB:', JSON.stringify(result.recordset, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkIds();
