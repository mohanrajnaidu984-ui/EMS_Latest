/**
 * Adds ApprovalMode column to QuoteApprovalHierarchy and QuoteApprovalSteps if missing.
 * Run: node server/migrations/run_add_quote_approval_mode.js
 */
const fs = require('fs');
const path = require('path');
const { connectDB, sql } = require('../dbConfig');

async function run() {
    try {
        await connectDB();
        const batch = fs.readFileSync(path.join(__dirname, 'add_quote_approval_mode.sql'), 'utf8');
        await sql.query(batch);
        console.log('[Migration] QuoteApprovalHierarchy / QuoteApprovalSteps ApprovalMode: OK');
        process.exit(0);
    } catch (err) {
        console.error('[Migration] ApprovalMode failed:', err.message);
        process.exit(1);
    }
}

run();
