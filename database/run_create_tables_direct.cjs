const sql = require('mssql');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

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

async function runSql() {
    try {
        await sql.connect(config);
        const sqlContent = fs.readFileSync(path.join(__dirname, 'create_quotes_tables.sql'), 'utf-8');
        await sql.query(sqlContent);
        console.log('SQL script executed successfully.');
    } catch (err) {
        console.error('Error executing SQL:', err);
    } finally {
        // sql.close() if possible, or just exit
        process.exit(0);
    }
}

runSql();
