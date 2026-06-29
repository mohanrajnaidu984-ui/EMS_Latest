/**
 * Adds WorkflowNo + creator snapshot columns to QuoteApprovalSteps.
 * Run: node server/migrations/run_add_quote_approval_steps_workflow_meta.js
 */
const fs = require('fs');
const path = require('path');
const { connectDB, sql } = require('../dbConfig');

async function run() {
    try {
        await connectDB();
        const batch = fs.readFileSync(
            path.join(__dirname, 'add_quote_approval_steps_workflow_meta.sql'),
            'utf8'
        );
        await sql.query(batch);
        console.log('[Migration] QuoteApprovalSteps workflow meta: OK');
        process.exit(0);
    } catch (err) {
        console.error('[Migration] QuoteApprovalSteps workflow meta failed:', err.message);
        process.exit(1);
    }
}

run();
