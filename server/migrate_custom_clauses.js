const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function runMigration() {
    try {
        await sql.connect(config);
        const sqlContent = fs.readFileSync(path.join(__dirname, 'migrations', 'add_custom_clauses.sql'), 'utf8');
        await sql.query(sqlContent);
        console.log('Migration executed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await sql.close();
    }
}

runMigration();
