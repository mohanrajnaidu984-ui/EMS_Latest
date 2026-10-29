/**
 * Creates EdCeoDueSubmissionReminderRecipient and seeds the three ED/CEO reminder recipients.
 * Run: node server/migrations/run_create_ed_ceo_due_submission_reminder_recipient.js
 */
const fs = require('fs');
const path = require('path');
const { connectDB, disconnectDB, sql } = require('../dbConfig');

async function run() {
    try {
        await connectDB();
        const batch = fs.readFileSync(
            path.join(__dirname, 'create_ed_ceo_due_submission_reminder_recipient.sql'),
            'utf8'
        );
        await sql.query(batch);
        const res = await sql.query`
            SELECT ID, Email, FullName, SortOrder, IsActive
            FROM dbo.EdCeoDueSubmissionReminderRecipient
            ORDER BY SortOrder, ID
        `;
        console.log('[Migration] EdCeoDueSubmissionReminderRecipient: OK');
        console.log(JSON.stringify(res.recordset || [], null, 2));
        await disconnectDB();
        process.exit(0);
    } catch (err) {
        console.error('[Migration] EdCeoDueSubmissionReminderRecipient failed:', err.message);
        try {
            await disconnectDB();
        } catch (_) {
            /* ignore */
        }
        process.exit(1);
    }
}

run();
