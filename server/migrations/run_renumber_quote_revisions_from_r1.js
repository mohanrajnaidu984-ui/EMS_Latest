/**
 * Repair quote revision numbering so each QuoteNo series is R1, R2, R3… by CreatedAt/ID.
 * Also fixes duplicates introduced by a naive R0→R1 bulk update.
 * Run: node server/migrations/run_renumber_quote_revisions_from_r1.js
 */
const { connectDB, sql } = require('../dbConfig');

async function run() {
    await connectDB();

    const series = await sql.query`
        SELECT DISTINCT QuoteNo
        FROM EnquiryQuotes
        WHERE QuoteNo IS NOT NULL AND QuoteNo > 0
        ORDER BY QuoteNo
    `;

    let updated = 0;
    let unchanged = 0;

    for (const row of series.recordset) {
        const quoteNo = Number(row.QuoteNo);
        const revs = await sql.query`
            SELECT ID, QuoteNumber, RevisionNo, CreatedAt
            FROM EnquiryQuotes
            WHERE QuoteNo = ${quoteNo}
            ORDER BY
                CASE WHEN CreatedAt IS NULL THEN 1 ELSE 0 END,
                CreatedAt ASC,
                ID ASC
        `;

        for (let i = 0; i < revs.recordset.length; i++) {
            const r = revs.recordset[i];
            const nextRev = i + 1;
            const oldQn = String(r.QuoteNumber || '');
            let nextQn = oldQn;
            if (/-R\d+\s*$/i.test(oldQn)) {
                nextQn = oldQn.replace(/-R\d+\s*$/i, `-R${nextRev}`);
            } else if (oldQn) {
                nextQn = `${oldQn.replace(/-R\d+$/i, '')}-R${nextRev}`;
            }

            if (Number(r.RevisionNo) === nextRev && oldQn === nextQn) {
                unchanged += 1;
                continue;
            }

            await sql.query`
                UPDATE EnquiryQuotes
                SET RevisionNo = ${nextRev},
                    QuoteNumber = ${nextQn},
                    UpdatedAt = GETDATE()
                WHERE ID = ${r.ID}
            `;

            await sql.query`
                UPDATE QuoteApprovalSteps
                SET RevisionNo = ${nextRev},
                    QuoteNumber = ${nextQn}
                WHERE QuoteId = ${r.ID}
            `;

            updated += 1;
            if (updated <= 20 || quoteNo === 1745) {
                console.log(`  QuoteNo=${quoteNo} id=${r.ID}: R${r.RevisionNo} → R${nextRev} | ${oldQn} → ${nextQn}`);
            }
        }
    }

    const dups = await sql.query`
        SELECT QuoteNo, RevisionNo, COUNT(*) AS Cnt
        FROM EnquiryQuotes
        GROUP BY QuoteNo, RevisionNo
        HAVING COUNT(*) > 1
    `;

    console.log(`[Renumber] Updated ${updated} row(s), unchanged ${unchanged}`);
    console.log(`[Renumber] Remaining duplicates: ${dups.recordset.length}`);
    process.exit(dups.recordset.length ? 1 : 0);
}

run().catch((e) => {
    console.error('[Renumber] Failed:', e.message);
    process.exit(1);
});
