/**
 * Migration: ApprovalWorkflowJson on EnquiryQuotes + EnquiryQuotesDraft
 * Run via: node server/migrations/run_add_approval_workflow_json.js
 */
const fs = require('fs');
const path = require('path');
const { connectDB, sql } = require('../dbConfig');

async function migrate() {
    try {
        await connectDB();
        const sqlText = fs.readFileSync(path.join(__dirname, 'add_approval_workflow_json.sql'), 'utf8');
        await sql.query(sqlText);
        console.log('[Migration] ApprovalWorkflowJson: OK');
        process.exit(0);
    } catch (err) {
        console.error('[Migration] ApprovalWorkflowJson failed:', err.message);
        process.exit(1);
    }
}

migrate();
