const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

async function runMigration() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected to database');

        const sqlFile = process.argv[2];
        if (!sqlFile) {
            console.error('Please provide SQL file path');
            process.exit(1);
        }

        const query = fs.readFileSync(sqlFile, 'utf8');
        console.log('Executing:', sqlFile);

        await sql.query(query);
        console.log('Migration executed successfully');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await sql.close();
    }
}

runMigration();
