/**
 * Repair enquiry 2998 "List of Equipment Connected" custom clause.
 *
 * Excel clipboard left a <title>Costing & IO - …xlsx</title> whose spell-mark
 * spans re-serialized as &lt;span…&gt; (~30KB tag soup) above the real table.
 *
 * Usage (from EMS/server):
 *   node scripts/repair-enquiry-2998-equipment-clause.js
 *   node scripts/repair-enquiry-2998-equipment-clause.js --dry-run
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const sql = require('mssql');

const dryRun = process.argv.includes('--dry-run');
const REQUEST_NO = '2998';
const CLAUSE_TITLE_RE = /List of Equipment Connected/i;

function stripOfficeClipboardChrome(html) {
    return String(html || '')
        .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<meta\b[^>]*\/?>/gi, '')
        .replace(/<link\b[^>]*\/?>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
}

function decodeOnceEscapedRichHtml(html) {
    const s = String(html || '');
    if (!/&lt;(?:span|table|div|p|tr|td)\b/i.test(s)) return s;
    if (!/ems-spell-mark|&lt;table|&lt;span/i.test(s)) return s;
    return s
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#0*39;/g, "'")
        .replace(/&amp;/gi, '&');
}

function stripSpellMarksRegex(html) {
    let s = String(html || '');
    for (let i = 0; i < 40; i++) {
        const next = s.replace(/<span\b[^>]*\bems-spell-mark\b[^>]*>([\s\S]*?)<\/span>/gi, '$1');
        if (next === s) break;
        s = next;
    }
    s = s.replace(/<span\b[^>]*\bdata-spell-id\b[^>]*>([\s\S]*?)<\/span>/gi, '$1');
    s = s.replace(/<span\b[^>]*\bems-spell-mark\b[^>]*>/gi, '');
    s = s.replace(/\s*data-spell-id="[^"]*"\s*/gi, ' ');
    s = s.replace(/\s*data-word="[^"]*"\s*/gi, ' ');
    return s;
}

function repairEquipmentClauseHtml(html) {
    let s = stripOfficeClipboardChrome(html);
    s = decodeOnceEscapedRichHtml(s);
    s = stripSpellMarksRegex(s);
    /* Drop leftover workbook-name debris if title was already unwrapped earlier. */
    s = s.replace(/Costing\s*&(?:amp;)?\s*IO\s*-\s*[^<]{0,120}?\.xlsx/gi, '');
    s = s.replace(/&lt;span\b[^&]*ems-spell-mark[\s\S]*?&lt;\/span&gt;/gi, '');
    return s.trim();
}

function summarize(html) {
    const s = String(html || '');
    return {
        len: s.length,
        tables: (s.match(/<table\b/gi) || []).length,
        title: /<title\b/i.test(s),
        escapedSpan: /&lt;span/i.test(s),
        spell: /ems-spell-mark/i.test(s),
        gulf: /Gulf Tobacco/i.test(s),
    };
}

async function repairTable(pool, table) {
    const sel = await pool
        .request()
        .input('rn', sql.NVarChar, REQUEST_NO)
        .query(`SELECT ID, CustomClauses FROM ${table} WHERE RequestNo = @rn`);

    for (const row of sel.recordset || []) {
        let parsed;
        try {
            parsed = JSON.parse(row.CustomClauses || '[]');
        } catch (e) {
            console.error(`${table} ID=${row.ID}: CustomClauses JSON parse failed`, e.message);
            continue;
        }
        if (!Array.isArray(parsed)) {
            console.error(`${table} ID=${row.ID}: CustomClauses is not an array`);
            continue;
        }

        let changed = false;
        const next = parsed.map((clause) => {
            if (!CLAUSE_TITLE_RE.test(clause?.title || '')) return clause;
            const before = String(clause.content || '');
            const after = repairEquipmentClauseHtml(before);
            console.log(`\n${table} ID=${row.ID} clause "${clause.title}"`);
            console.log('  before', summarize(before));
            console.log('  after ', summarize(after));
            if (after === before) {
                console.log('  (no change)');
                return clause;
            }
            changed = true;
            const tablePlain = (after.match(/<table[\s\S]*?<\/table>/i) || [''])[0]
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 180);
            console.log('  table sample:', tablePlain);
            return { ...clause, content: after };
        });

        if (!changed) {
            console.log(`${table} ID=${row.ID}: nothing to repair`);
            continue;
        }
        if (dryRun) {
            console.log(`${table} ID=${row.ID}: dry-run — not written`);
            continue;
        }
        const json = JSON.stringify(next);
        await pool
            .request()
            .input('id', sql.Int, row.ID)
            .input('cc', sql.NVarChar(sql.MAX), json)
            .query(`UPDATE ${table} SET CustomClauses = @cc WHERE ID = @id`);
        console.log(`${table} ID=${row.ID}: UPDATED CustomClauses (${json.length} chars)`);
    }
}

(async () => {
    const pool = await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE,
        options: {
            encrypt: String(process.env.DB_ENCRYPT || '').toLowerCase() === 'true',
            trustServerCertificate:
                String(process.env.DB_TRUST_SERVER_CERTIFICATE || 'true').toLowerCase() !== 'false',
        },
    });
    console.log(dryRun ? 'DRY RUN' : 'APPLYING REPAIR', `RequestNo=${REQUEST_NO}`);
    await repairTable(pool, 'EnquiryQuotes');
    await repairTable(pool, 'EnquiryQuotesDraft');
    await pool.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
