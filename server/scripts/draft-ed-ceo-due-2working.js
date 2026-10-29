'use strict';

/**
 * Preview ED/CEO "2 Working days" due email draft (does not send).
 * Usage: node scripts/draft-ed-ceo-due-2working.js [YYYY-MM-DD]
 */
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { sql, connectDB } = require('../dbConfig');
const { todayYmdInSchedulerTz, addWorkingDaysToYmd } = require('../lib/schedulerTime');
const {
    buildEdCeoDueEnquiryRows,
    buildEdCeoReminderSubject,
    buildEdCeoReminderEmailHtml,
    REMINDER_KIND_TWO_WORKING,
} = require('../lib/edCeoDueSubmissionReminder');

async function main() {
    await connectDB();
    const dueYmd = String(process.argv[2] || addWorkingDaysToYmd(todayYmdInSchedulerTz(), 2)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueYmd)) {
        throw new Error(`Invalid date: ${dueYmd}`);
    }

    const rows = await buildEdCeoDueEnquiryRows(dueYmd);
    const subject = buildEdCeoReminderSubject(REMINDER_KIND_TWO_WORKING, dueYmd);
    const html = buildEdCeoReminderEmailHtml(REMINDER_KIND_TWO_WORKING, dueYmd, rows);

    const outDir = path.join(__dirname, '..', 'temp');
    fs.mkdirSync(outDir, { recursive: true });
    const htmlPath = path.join(outDir, `ed-ceo-due-2working-draft-${dueYmd}.html`);
    const jsonPath = path.join(outDir, `ed-ceo-due-2working-draft-${dueYmd}.json`);

    fs.writeFileSync(htmlPath, html, 'utf8');
    fs.writeFileSync(
        jsonPath,
        JSON.stringify({ dueYmd, subject, rowCount: rows.length, rows }, null, 2),
        'utf8',
    );

    console.log('Due date:', dueYmd);
    console.log('Subject:', subject);
    console.log('Rows:', rows.length);
    console.log('');
    if (!rows.length) {
        console.log('(No ED/CEO signature enquiries due on this date.)');
    } else {
        rows.forEach((r, i) => {
            console.log(`${i + 1}. Enquiry ${r.requestNo}`);
            console.log(`   Division:\n${String(r.division || '')
                .split('\n')
                .map((l) => '   ' + l)
                .join('\n')}`);
            console.log(`   Project: ${r.projectName}`);
            console.log(`   Created by: ${r.enquiryCreatedBy} | Due: ${r.dueDate}`);
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
