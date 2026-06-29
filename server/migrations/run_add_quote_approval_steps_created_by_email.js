/**
 * Adds CreatedByEmail column to QuoteApprovalSteps if missing.
 * Run: node server/migrations/run_add_quote_approval_steps_created_by_email.js
 */
const fs = require('fs');
const path = require('path');
const { connectDB, sql } = require('../dbConfig');

async function run() {
    try {
        await connectDB();
        const batch = fs.readFileSync(
            path.join(__dirname, 'add_quote_approval_steps_created_by_email.sql'),
            'utf8'
        );
        await sql.query(batch);
        console.log('[Migration] QuoteApprovalSteps.CreatedByEmail: OK');
        process.exit(0);
    } catch (err) {
        console.error('[Migration] QuoteApprovalSteps.CreatedByEmail failed:', err.message);
        process.exit(1);
    }
}

run();
