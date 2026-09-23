/**
 * Adds IsFinalApprover to hierarchy + runtime approval steps.
 * Run: node server/migrations/run_add_quote_approval_final_approver.js
 */
const fs = require('fs');
const path = require('path');
const { connectDB, sql } = require('../dbConfig');

async function run() {
    try {
        await connectDB();
        const batch = fs.readFileSync(path.join(__dirname, 'add_quote_approval_final_approver.sql'), 'utf8');
        await sql.query(batch);
        console.log('[Migration] Quote approval IsFinalApprover: OK');
        process.exit(0);
    } catch (err) {
        console.error('[Migration] Quote approval IsFinalApprover failed:', err.message);
        process.exit(1);
    }
}

run();
