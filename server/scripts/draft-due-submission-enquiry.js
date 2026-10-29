/**
 * Draft one individual due-submission reminder email for a single enquiry (no send).
 * Usage: node server/scripts/draft-due-submission-enquiry.js 2548 [YYYY-MM-DD]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { connectDB } = require('../dbConfig');
const { loadEnquiryEmailRow } = require('../lib/loadEnquiryEmailRow');
const { resolveDueEmailDivisionLabel } = require('../lib/enquiryLeadDivisions');
const { formatEnquiryDate, formatShortDate } = require('../lib/enquiryNotifyEmailHtml');
const {
    buildDueSubmissionReminderSubject,
    buildDueSubmissionReminderEmailHtml,
} = require('../lib/dueSubmissionReminder');

function displayCustomerName(row) {
    if (Array.isArray(row.CustomerNamesList) && row.CustomerNamesList.length) {
        return row.CustomerNamesList.join(', ');
    }
    const raw = String(row.CustomerNameDisplay || row.CustomerName || '').trim();
    return raw.replace(/^\d{2}\.\s*/g, '').trim();
}

function displayConsultantName(row) {
    if (Array.isArray(row.ConsultantNamesList) && row.ConsultantNamesList.length) {
        return row.ConsultantNamesList.join(', ');
    }
    return String(row.ConsultantName || '').trim();
}

async function main() {
    const requestNo = String(process.argv[2] || '2548').trim();
    await connectDB();

    const row = await loadEnquiryEmailRow(requestNo);
    if (!row) {
        throw new Error(`Enquiry ${requestNo} not found`);
    }

    const dueFromDb = row.DueDate ? new Date(row.DueDate) : null;
    const dueYmdFromDb =
        dueFromDb && !Number.isNaN(dueFromDb.getTime())
            ? `${dueFromDb.getFullYear()}-${String(dueFromDb.getMonth() + 1).padStart(2, '0')}-${String(dueFromDb.getDate()).padStart(2, '0')}`
            : '';
    const dueYmd = String(process.argv[3] || dueYmdFromDb || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueYmd)) {
        throw new Error(`Invalid due date. Pass YYYY-MM-DD or set EnquiryMaster.DueDate.`);
    }

    const divisionLabel = await resolveDueEmailDivisionLabel(requestNo, row);
    const dueParts = dueYmd.split('-').map(Number);
    const dueDateForDisplay = formatShortDate(new Date(dueParts[0], dueParts[1] - 1, dueParts[2]));
    const listEntry = {
        requestNo: String(row.RequestNo || '').trim(),
        division: divisionLabel,
        enquiryDate: formatEnquiryDate(row.EnquiryDate),
        projectName: String(row.ProjectName || '').trim(),
        customerName: displayCustomerName(row),
        clientName: String(row.ClientName || '').trim(),
        consultantName: displayConsultantName(row),
        dueDate: dueDateForDisplay,
        enquiryDetails: String(row.EnquiryDetails || '').trim(),
        enquiryCreatedBy: String(row.CreatedBy ?? row.createdBy ?? '').trim(),
    };

    const subject = buildDueSubmissionReminderSubject(dueYmd);
    const html = buildDueSubmissionReminderEmailHtml(dueYmd, [listEntry]);

    const outDir = path.join(__dirname, '..', 'temp');
    fs.mkdirSync(outDir, { recursive: true });
    const htmlPath = path.join(outDir, `due-submission-draft-${requestNo}.html`);
    const jsonPath = path.join(outDir, `due-submission-draft-${requestNo}.json`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    fs.writeFileSync(
        jsonPath,
        JSON.stringify(
            {
                requestNo,
                dueYmd,
                subject,
                divisionLabel,
                divisionsInvolvedList: row.DivisionsInvolvedList || [],
                listEntry,
            },
            null,
            2,
        ),
        'utf8',
    );

    console.log('Subject:', subject);
    console.log('Division label:\n' + divisionLabel);
    console.log('HTML:', htmlPath);
    console.log('JSON:', jsonPath);
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
