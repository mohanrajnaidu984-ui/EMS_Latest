/**
 * Creates QuoteApprovalCorrections table for correction-required history.
 * Run: node server/migrations/run_create_quote_approval_corrections.js
 */
const fs = require('fs');
const path = require('path');
const { connectDB, sql } = require('../dbConfig');

async function run() {
    try {
        await connectDB();
        const batch = fs.readFileSync(path.join(__dirname, 'create_quote_approval_corrections.sql'), 'utf8');
        await sql.query(batch);
        console.log('[Migration] QuoteApprovalCorrections: OK');
        process.exit(0);
    } catch (err) {
        console.error('[Migration] QuoteApprovalCorrections failed:', err.message);
        process.exit(1);
    }
}

run();
