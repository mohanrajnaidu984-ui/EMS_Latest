/**
 * Consolidate duplicate QuoteNo values that share the same
 * RequestNo + LeadJob + Customer (ToName). Keeps the earliest QuoteNo
 * and renumbers revisions R0, R1, R2… by CreatedAt.
 *
 * Run: node server/migrations/run_consolidate_quote_no_by_tuple.js
 * Optional: REQUEST_NO=1525 to limit scope.
 */
const { connectDB, sql } = require('../dbConfig');

function stripLead(s) {
    return String(s || '')
        .replace(/^\s*L\d+\s*[-–—:]\s*/i, '')
        .replace(/^\s*Sub\s*Job\s*[-–—:]\s*/i, '')
        .trim()
        .toLowerCase();
}

function leadMatch(a, b) {
    const x = stripLead(a);
    const y = stripLead(b);
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
}

function tupleKey(requestNo, leadJob, toName) {
    return [
        String(requestNo || '').trim().toLowerCase(),
        stripLead(leadJob),
        String(toName || '').trim().toLowerCase(),
    ].join('::');
}

async function run() {
    await connectDB();
    const onlyRequestNo = String(process.env.REQUEST_NO || '').trim();

    const all = onlyRequestNo
        ? await sql.query`
            SELECT ID, RequestNo, QuoteNo, RevisionNo, QuoteNumber, LeadJob, ToName, CreatedAt
            FROM EnquiryQuotes
            WHERE LTRIM(RTRIM(ISNULL(CAST(RequestNo AS NVARCHAR(50)), ''))) = LTRIM(RTRIM(${onlyRequestNo}))
            ORDER BY ID
          `
        : await sql.query`
            SELECT ID, RequestNo, QuoteNo, RevisionNo, QuoteNumber, LeadJob, ToName, CreatedAt
            FROM EnquiryQuotes
            ORDER BY ID
          `;

    const groups = new Map();
    for (const row of all.recordset) {
        const key = tupleKey(row.RequestNo, row.LeadJob, row.ToName);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }

    let groupsFixed = 0;
    let rowsUpdated = 0;

    for (const [, rows] of groups) {
        if (rows.length < 2) continue;

        // Merge rows that share lead-name match (already keyed by stripLead)
        const quoteNos = [
            ...new Set(rows.map((r) => Number(r.QuoteNo)).filter((n) => n > 0)),
        ].sort((a, b) => a - b);
        if (quoteNos.length < 2) continue;

        const canonical = quoteNos[0];
        const sorted = [...rows].sort((a, b) => {
            const ta = a.CreatedAt ? new Date(a.CreatedAt).getTime() : 0;
            const tb = b.CreatedAt ? new Date(b.CreatedAt).getTime() : 0;
            if (ta !== tb) return ta - tb;
            return Number(a.ID) - Number(b.ID);
        });

        console.log(
            `\nTuple RequestNo=${sorted[0].RequestNo} Lead=${sorted[0].LeadJob} To=${sorted[0].ToName}`
        );
        console.log(`  QuoteNos ${quoteNos.join(',')} → keep ${canonical}`);

        for (let i = 0; i < sorted.length; i++) {
            const r = sorted[i];
            const nextRev = i;
            const oldQn = String(r.QuoteNumber || '');
            const nextQn = /-R\d+\s*$/i.test(oldQn)
                ? oldQn.replace(/\/\d+-R\d+\s*$/i, `/${canonical}-R${nextRev}`)
                : oldQn;

            if (Number(r.QuoteNo) === canonical && Number(r.RevisionNo) === nextRev && oldQn === nextQn) {
                continue;
            }

            console.log(
                `  id=${r.ID}: ${oldQn} (Q${r.QuoteNo}/R${r.RevisionNo}) → ${nextQn} (Q${canonical}/R${nextRev})`
            );

            await sql.query`
                UPDATE EnquiryQuotes
                SET QuoteNo = ${canonical},
                    RevisionNo = ${nextRev},
                    QuoteNumber = ${nextQn},
                    UpdatedAt = GETDATE()
                WHERE ID = ${r.ID}
            `;
            await sql.query`
                UPDATE QuoteApprovalSteps
                SET QuoteNo = ${canonical},
                    RevisionNo = ${nextRev},
                    QuoteNumber = ${nextQn}
                WHERE QuoteId = ${r.ID}
            `;
            rowsUpdated += 1;
        }

        for (const qn of quoteNos) {
            if (qn === canonical) continue;
            await sql.query`
                UPDATE EnquiryQuotesDraft
                SET QuoteNo = ${canonical}
                WHERE LTRIM(RTRIM(ISNULL(CAST(RequestNo AS NVARCHAR(50)), ''))) = LTRIM(RTRIM(${String(sorted[0].RequestNo)}))
                  AND LOWER(LTRIM(RTRIM(ISNULL(ToName, N'')))) = LOWER(LTRIM(RTRIM(${String(sorted[0].ToName)})))
                  AND QuoteNo = ${qn}
            `;
        }

        groupsFixed += 1;
    }

    console.log(`\n[Consolidate] Groups fixed: ${groupsFixed}, rows updated: ${rowsUpdated}`);
    process.exit(0);
}

run().catch((e) => {
    console.error('[Consolidate] Failed:', e.message);
    process.exit(1);
});
