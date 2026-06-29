const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'routes', 'quotes.js');
let s = fs.readFileSync(p, 'utf8');

const start = s.indexOf("\nrouter.get('/list/pending', async (req, res) => {");
const end = s.indexOf("// GET /api/quotes/config/templates", start);
if (start === -1 || end === -1) {
    console.error('markers not found', start, end);
    process.exit(1);
}

const replacement = `
router.get('/list/pending', async (req, res) => {
    try {
        let { userEmail } = req.query;
        console.log(\`[API] Check Pending Quotes for \${userEmail || 'All'}...\`);
        const { enquiries, accessCtx, userEmail: ue } = await runPendingQuoteListQuery(sql, userEmail, '');
        if (enquiries.length > 0) {
            const finalMapped = await mapQuoteListingRows(sql, enquiries, ue, accessCtx);
            if (finalMapped.length > 0) {
                console.log(\`[API] FINAL DATA Enq 0:\`, {
                    ReqNo: finalMapped[0].RequestNo,
                    Client: finalMapped[0].ClientName,
                    Consultant: finalMapped[0].ConsultantName,
                    SubJobPricesLen: finalMapped[0].SubJobPrices?.length,
                });
            }
            console.log(\`[API] Pending Quotes found: \${finalMapped.length}\`);
            return res.json(finalMapped);
        }
        return res.json([]);
    } catch (err) {
        console.error('Error fetching pending quotes:', err);
        res.status(500).json({ error: 'Failed to fetch pending quotes', details: err.message });
    }
});

router.get('/list/search', async (req, res) => {
    try {
        let { userEmail, q, dateFrom, dateTo } = req.query;
        const extra = buildQuoteListSearchExtraWhere(q || '', dateFrom || '', dateTo || '');
        if (!extra.ok) {
            return res.json([]);
        }
        const { enquiries: pendingRaw, accessCtx, userEmail: ue } = await runPendingQuoteListQuery(sql, userEmail, extra.sql);
        const { enquiries: quotedRaw } = await runQuotedQuoteListQuery(sql, userEmail, extra.sql);
        const pendingMapped = await mapQuoteListingRows(sql, pendingRaw || [], ue, accessCtx);
        const quotedMapped = await mapQuoteListingRows(sql, quotedRaw || [], ue, accessCtx);
        const byNo = new Map();
        for (const row of quotedMapped) {
            byNo.set(String(row.RequestNo), { ...row, QuoteListKind: 'quoted' });
        }
        for (const row of pendingMapped) {
            byNo.set(String(row.RequestNo), { ...row, QuoteListKind: 'pending' });
        }
        const merged = Array.from(byNo.values()).sort((a, b) => {
            const ta = a.DueDate ? new Date(a.DueDate).getTime() : 0;
            const tb = b.DueDate ? new Date(b.DueDate).getTime() : 0;
            return tb - ta;
        });
        return res.json(merged);
    } catch (err) {
        console.error('Error searching quote lists:', err);
        res.status(500).json({ error: 'Failed to search quote lists', details: err.message });
    }
});

`;

s = s.slice(0, start) + replacement + s.slice(end);
fs.writeFileSync(p, s);
console.log('patched', p);
