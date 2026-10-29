/**
 * Sanitize stored quote rich-text columns for one or more RequestNo values.
 * Strips Excel <style>/xl classes, pulls BOQ Note out of tables (via shared rules
 * mirrored here for Node), and rewrites EnquiryQuotes + Draft rows.
 *
 * Usage (from EMS/server):
 *   node scripts/sanitize-enquiry-quote-html.js 1515
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const sql = require('mssql');

const HTML_COLS = [
    'ScopeOfWork',
    'BasisOfOffer',
    'Exclusions',
    'PricingTerms',
    'Schedule',
    'Warranty',
    'ResponsibilityMatrix',
    'TermsConditions',
    'Acceptance',
    'BillOfQuantity',
];

function sanitizeQuoteRichHtmlNode(html) {
    let body = String(html || '');
    if (!body.trim()) return body;
    body = body
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    /* Leaked Excel CSS text */
    body = body.replace(/\.xl\d+\s*\{[^}]*\}/gi, '');
    body = body.replace(/mso-[a-z-]+:[^;]+;?/gi, '');
    body = body.replace(/\bclass\s*=\s*["'][^"']*\bxl\d+\b[^"']*["']/gi, (m) =>
        m.replace(/\bxl\d+\b/gi, '').replace(/\s+/g, ' ')
    );
    /* NBSP / spacer runs → normal spaces (never delete — that glued words). */
    body = body
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#160;/gi, ' ')
        .replace(/&#x0*a0;/gi, ' ')
        .replace(/[\u00a0\u202f\u2007\u2009]/g, ' ')
        .replace(/[ \t\f\v]{2,}/g, ' ');
    /* Note rows stay in DB tables; renderer (sanitizeQuoteRichHtml) extracts on paint. */
    return body.trim();
}

async function main() {
    const requestNos = process.argv.slice(2).filter(Boolean);
    if (!requestNos.length) {
        console.error('Usage: node scripts/sanitize-enquiry-quote-html.js <RequestNo> [RequestNo…]');
        process.exit(2);
    }
    const cfg = {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE,
        options: {
            encrypt: String(process.env.DB_ENCRYPT || '').toLowerCase() === 'true',
            trustServerCertificate:
                String(process.env.DB_TRUST_SERVER_CERTIFICATE || 'true').toLowerCase() !== 'false',
        },
    };
    const pool = await sql.connect(cfg);
    let updated = 0;
    for (const rn of requestNos) {
        for (const table of ['EnquiryQuotes', 'EnquiryQuotesDraft']) {
            const sel = await pool
                .request()
                .input('rn', sql.NVarChar, String(rn))
                .query(`SELECT ID, ${HTML_COLS.join(', ')} FROM ${table} WHERE RequestNo = @rn`);
            for (const row of sel.recordset || []) {
                const sets = [];
                const req = pool.request().input('id', sql.Int, row.ID);
                const changedCols = [];
                HTML_COLS.forEach((col, i) => {
                    const before = row[col];
                    const after = sanitizeQuoteRichHtmlNode(before);
                    if (after !== String(before || '')) {
                        const p = `c${i}`;
                        req.input(p, sql.NVarChar(sql.MAX), after);
                        sets.push(`${col} = @${p}`);
                        changedCols.push(col);
                        const beforeSample = String(before || '')
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .slice(0, 120);
                        const afterSample = String(after || '')
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .slice(0, 120);
                        console.log(
                            `  field ${table}.${col} ID=${row.ID}: nbsp/spacers normalized` +
                                `\n    before: ${beforeSample}` +
                                `\n    after:  ${afterSample}`
                        );
                    }
                });
                if (!sets.length) continue;
                await req.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE ID = @id`);
                updated += 1;
                console.log(
                    `updated ${table} ID=${row.ID} RequestNo=${rn} cols=${changedCols.join(',')}`
                );
            }
        }
    }
    console.log(`done. rows updated: ${updated}`);
    await pool.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
