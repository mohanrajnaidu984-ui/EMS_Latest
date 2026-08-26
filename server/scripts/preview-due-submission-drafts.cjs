'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { connectDB } = require('../dbConfig');
const { previewDueSubmissionReminderDrafts } = require('../lib/dueSubmissionReminder');
const { tomorrowYmdInSchedulerTz } = require('../lib/schedulerTime');

(async () => {
    await connectDB();
    const dueYmd = process.argv[2] || tomorrowYmdInSchedulerTz();
    const preview = await previewDueSubmissionReminderDrafts({ dueYmd });

    const outDir = path.join(__dirname, '..', 'temp', 'due-submission-drafts');
    fs.mkdirSync(outDir, { recursive: true });

    console.log(`Due date: ${preview.dueYmd}`);
    console.log(`Subject: ${preview.subject}`);
    console.log(`From: ${preview.from}`);
    console.log(`Recipients: ${preview.drafts.length}`);
    console.log('');

    const summary = [];
    for (const d of preview.drafts) {
        const safeTo = String(d.to).replace(/[^a-zA-Z0-9._@-]/g, '_');
        const htmlPath = path.join(outDir, `${preview.dueYmd}_${safeTo}.html`);
        fs.writeFileSync(htmlPath, d.html, 'utf8');
        summary.push({
            to: d.to,
            enquiryCount: d.enquiryCount,
            enquiries: d.enquiries.map((e) => ({
                requestNo: e.requestNo,
                projectName: e.projectName,
                dueDate: e.dueDate,
                enquiryCreatedBy: e.enquiryCreatedBy,
            })),
            htmlFile: htmlPath,
        });
        console.log(`To: ${d.to} (${d.enquiryCount} row(s))`);
        for (const e of d.enquiries) {
            console.log(
                `  #${e.requestNo} | ${e.projectName} | Created By: ${e.enquiryCreatedBy || '(blank)'}`
            );
        }
        console.log(`  HTML: ${htmlPath}`);
        console.log('');
    }

    const indexPath = path.join(outDir, `${preview.dueYmd}_index.json`);
    fs.writeFileSync(
        indexPath,
        JSON.stringify({ dueYmd: preview.dueYmd, subject: preview.subject, from: preview.from, drafts: summary }, null, 2),
        'utf8'
    );
    console.log(`Index: ${indexPath}`);
    process.exit(0);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
