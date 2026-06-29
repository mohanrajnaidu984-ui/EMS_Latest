require('dotenv').config();
const { dbConfig } = require('./dbConfig');
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
    try {
        console.log('Connecting to DB...');
        await sql.connect(dbConfig);
        console.log('Connected.');

        const sqlFile = path.join(__dirname, 'migrations', 'fix_pricing_tables.sql');
        const content = fs.readFileSync(sqlFile, 'utf8');

        // Split by GO
        const batches = content.split(/\bGO\b/i).filter(b => b.trim().length > 0);

        console.log(`Found ${batches.length} batches.`);

        for (const batch of batches) {
            console.log('Executing batch...');
            await sql.query(batch);
        }

        console.log('Migration Complete.');

    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        sql.close();
    }
}

applyMigration();
