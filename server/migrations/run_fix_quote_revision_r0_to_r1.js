/**
 * First approved quote should be R1, not R0.
 * Fixes EnquiryQuotes (and linked QuoteApprovalSteps) where RevisionNo = 0.
 * Run: node server/migrations/run_fix_quote_revision_r0_to_r1.js
 */
const { connectDB, sql } = require('../dbConfig');

async function run() {
    try {
        await connectDB();

        const before = await sql.query`
            SELECT ID, QuoteNumber, QuoteNo, RevisionNo
            FROM EnquiryQuotes
            WHERE RevisionNo = 0 OR QuoteNumber LIKE N'%-R0'
            ORDER BY ID
        `;
        console.log(`[fix R0→R1] Found ${before.recordset.length} quote row(s) to fix`);
        before.recordset.forEach((r) => {
            console.log(`  id=${r.ID} ${r.QuoteNumber} QuoteNo=${r.QuoteNo} Rev=${r.RevisionNo}`);
        });

        const updQuotes = await sql.query`
            UPDATE EnquiryQuotes
            SET
                QuoteNumber = CASE
                    WHEN QuoteNumber LIKE N'%-R0' THEN REPLACE(QuoteNumber, N'-R0', N'-R1')
                    ELSE QuoteNumber
                END,
                RevisionNo = CASE WHEN RevisionNo = 0 THEN 1 ELSE RevisionNo END,
                UpdatedAt = GETDATE()
            WHERE RevisionNo = 0 OR QuoteNumber LIKE N'%-R0'
        `;
        console.log(`[fix R0→R1] EnquiryQuotes rows affected: ${updQuotes.rowsAffected?.[0] ?? '?'}`);

        const updSteps = await sql.query`
            UPDATE QuoteApprovalSteps
            SET
                QuoteNumber = CASE
                    WHEN QuoteNumber LIKE N'%-R0' THEN REPLACE(QuoteNumber, N'-R0', N'-R1')
                    ELSE QuoteNumber
                END,
                RevisionNo = CASE WHEN RevisionNo = 0 THEN 1 ELSE RevisionNo END
            WHERE RevisionNo = 0 OR QuoteNumber LIKE N'%-R0'
        `;
        console.log(`[fix R0→R1] QuoteApprovalSteps rows affected: ${updSteps.rowsAffected?.[0] ?? '?'}`);

        const updDrafts = await sql.query`
            UPDATE EnquiryQuotesDraft
            SET
                QuoteNumber = CASE
                    WHEN QuoteNumber LIKE N'%-R0' THEN REPLACE(QuoteNumber, N'-R0', N'-R1')
                    ELSE QuoteNumber
                END,
                RevisionNo = CASE WHEN RevisionNo = 0 THEN 1 ELSE RevisionNo END,
                UpdatedAt = GETDATE()
            WHERE (RevisionNo = 0 AND QuoteNo > 0 AND Status = N'Promoted')
               OR QuoteNumber LIKE N'%-R0'
        `;
        console.log(`[fix R0→R1] EnquiryQuotesDraft rows affected: ${updDrafts.rowsAffected?.[0] ?? '?'}`);

        console.log('[fix R0→R1] Done');
        process.exit(0);
    } catch (err) {
        console.error('[fix R0→R1] Failed:', err.message);
        process.exit(1);
    }
}

run();
