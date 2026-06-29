const { connectDB, sql } = require('../server/dbConfig');
const fs = require('fs');
const path = require('path');

async function runSql() {
    try {
        await connectDB();
        const sqlContent = fs.readFileSync(path.join(__dirname, 'create_quotes_tables.sql'), 'utf-8');
        await sql.query(sqlContent);
        console.log('SQL script executed successfully.');
    } catch (err) {
        console.error('Error executing SQL:', err);
    } finally {
        process.exit(0);
    }
}

runSql();
