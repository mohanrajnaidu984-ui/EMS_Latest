/**
 * Migration: ReasonForRevision on EnquiryQuotes + EnquiryQuotesDraft
 * Run via: node server/migrations/run_add_reason_for_revision.js
 */
const fs = require('fs');
const path = require('path');
const { connectDB, sql } = require('../dbConfig');

async function migrate() {
    try {
        await connectDB();
        const sqlText = fs.readFileSync(path.join(__dirname, 'add_reason_for_revision.sql'), 'utf8');
        await sql.query(sqlText);
        console.log('[Migration] ReasonForRevision: OK');
        process.exit(0);
    } catch (err) {
        console.error('[Migration] ReasonForRevision failed:', err.message);
        process.exit(1);
    }
}

migrate();
