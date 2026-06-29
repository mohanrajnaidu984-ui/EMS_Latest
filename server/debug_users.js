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

async function checkUsers() {
    try {
        await sql.connect(config);
        const res = await sql.query`SELECT FullName, EmailId FROM Master_ConcernedSE WHERE FullName LIKE '%Electrical%' OR FullName LIKE '%BMS%'`;
        console.table(res.recordset);
        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

checkUsers();
