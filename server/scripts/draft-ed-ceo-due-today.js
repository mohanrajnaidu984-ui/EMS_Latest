'use strict';

/**
 * Preview ED/CEO "due today" email draft (does not send).
 * Usage: node scripts/draft-ed-ceo-due-today.js [YYYY-MM-DD]
 */
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { sql, connectDB } = require('../dbConfig');
const { todayYmdInSchedulerTz } = require('../lib/schedulerTime');
const {
    buildEdCeoDueEnquiryRows,
    buildEdCeoReminderSubject,
    buildEdCeoReminderEmailHtml,
    REMINDER_KIND_TODAY,
} = require('../lib/edCeoDueSubmissionReminder');

async function main() {
    await connectDB();
    const dueYmd = String(process.argv[2] || todayYmdInSchedulerTz()).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueYmd)) {
        throw new Error(`Invalid date: ${dueYmd}`);
    }

    const rows = await buildEdCeoDueEnquiryRows(dueYmd);
    const subject = buildEdCeoReminderSubject(REMINDER_KIND_TODAY, dueYmd);
    const html = buildEdCeoReminderEmailHtml(REMINDER_KIND_TODAY, dueYmd, rows);

    const outDir = path.join(__dirname, '..', 'tmp');
    fs.mkdirSync(outDir, { recursive: true });
    const htmlPath = path.join(outDir, `ed-ceo-due-today-draft-${dueYmd}.html`);
    const jsonPath = path.join(outDir, `ed-ceo-due-today-draft-${dueYmd}.json`);

    fs.writeFileSync(htmlPath, html, 'utf8');
    fs.writeFileSync(
        jsonPath,
        JSON.stringify({ dueYmd, subject, rowCount: rows.length, rows }, null, 2),
        'utf8'
    );

    console.log('Due date:', dueYmd);
    console.log('Subject:', subject);
    console.log('Rows:', rows.length);
    console.log('');
    if (!rows.length) {
        console.log('(No ED/CEO signature enquiries due on this date.)');
    } else {
        rows.forEach((r, i) => {
            console.log(`${i + 1}. Enquiry ${r.requestNo} | Division: ${r.division}`);
            console.log(`   Project: ${r.projectName}`);
            console.log(`   Customer: ${r.customerName} | Due: ${r.dueDate}`);
            console.log('');
        });
    }
    console.log('HTML draft:', htmlPath);
    console.log('JSON draft:', jsonPath);
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await sql.close();
        } catch (_) {
            /* ignore */
        }
    });
