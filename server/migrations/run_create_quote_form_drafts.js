/**
 * Creates QuoteFormDrafts table if missing.
 * Run: node server/migrations/run_create_quote_form_drafts.js
 */
const fs = require('fs');
const path = require('path');
const { connectDB, sql } = require('../dbConfig');

async function run() {
    try {
        await connectDB();
        const sqlPath = path.join(__dirname, 'create_quote_form_drafts.sql');
        const batch = fs.readFileSync(sqlPath, 'utf8');
        await sql.query(batch);
        console.log('[Migration] QuoteFormDrafts: OK');
        process.exit(0);
    } catch (err) {
        console.error('[Migration] QuoteFormDrafts failed:', err.message);
        process.exit(1);
    }
}

run();
