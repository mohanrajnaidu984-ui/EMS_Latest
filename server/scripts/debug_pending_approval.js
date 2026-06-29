/**
 * Debug pending approvals for a user / enquiry.
 * Run: node server/scripts/debug_pending_approval.js
 */
const { connectDB, sql } = require('../dbConfig');
const {
    fetchPendingApprovalsForUser,
    countPendingApprovalsForUser,
} = require('../lib/quoteApprovalSteps');

const EMAIL = 'mohan.naidu@almoayyedcg.com';
const REQUEST_NO = '14';

async function run() {
    await connectDB();

    const steps = await sql.query`
        SELECT ID, QuoteId, DraftQuoteId, RequestNo, ApproverEmail, ApproverName,
               ApproverSequence, Status, CustomerName, LeadJobName, OwnJob
        FROM QuoteApprovalSteps
        WHERE LTRIM(RTRIM(RequestNo)) = ${REQUEST_NO}
        ORDER BY ApproverSequence ASC, ID ASC
    `;
    console.log(`\n=== QuoteApprovalSteps RequestNo=${REQUEST_NO} (${steps.recordset.length} rows) ===`);
    console.log(JSON.stringify(steps.recordset, null, 2));

    const mohanSteps = await sql.query`
        SELECT ID, QuoteId, DraftQuoteId, RequestNo, ApproverEmail, ApproverName,
               ApproverSequence, Status
        FROM QuoteApprovalSteps
        WHERE LOWER(LTRIM(RTRIM(ISNULL(ApproverEmail, N'')))) = ${EMAIL}
        ORDER BY RequestNo, ApproverSequence
    `;
    console.log(`\n=== All steps for ${EMAIL} (${mohanSteps.recordset.length} rows) ===`);
    console.log(JSON.stringify(mohanSteps.recordset, null, 2));

    const count = await countPendingApprovalsForUser(EMAIL);
    const pending = await fetchPendingApprovalsForUser(EMAIL);
    console.log(`\n=== fetchPendingApprovalsForUser count=${count} ===`);
    console.log(JSON.stringify(pending, null, 2));

    const drafts = await sql.query`
        SELECT ID, RequestNo, ToName, LeadJob, OwnJob, ApprovalWorkflowJson
        FROM EnquiryQuotesDraft
        WHERE LTRIM(RTRIM(RequestNo)) = ${REQUEST_NO}
        ORDER BY ID DESC
    `;
    console.log(`\n=== EnquiryQuotesDraft for ${REQUEST_NO} (${drafts.recordset.length}) ===`);
    for (const d of drafts.recordset || []) {
        console.log({
            ID: d.ID,
            RequestNo: d.RequestNo,
            ToName: d.ToName,
            ApprovalWorkflowJson: String(d.ApprovalWorkflowJson || '').slice(0, 300),
        });
    }

    const quotes = await sql.query`
        SELECT ID, RequestNo, ToName, LeadJob, OwnJob, QuoteNumber, ApprovalWorkflowJson
        FROM EnquiryQuotes
        WHERE LTRIM(RTRIM(RequestNo)) = ${REQUEST_NO}
        ORDER BY ID DESC
    `;
    console.log(`\n=== EnquiryQuotes for ${REQUEST_NO} (${quotes.recordset.length}) ===`);
    for (const q of quotes.recordset || []) {
        console.log({
            ID: q.ID,
            RequestNo: q.RequestNo,
            ToName: q.ToName,
            QuoteNumber: q.QuoteNumber,
            ApprovalWorkflowJson: String(q.ApprovalWorkflowJson || '').slice(0, 200),
        });
    }

    process.exit(0);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
