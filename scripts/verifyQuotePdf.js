/**
 * verifyQuotePdf.js — integrity checks for quote PDF (Paged.js path).
 *
 * Usage (from EMS/):
 *   node scripts/verifyQuotePdf.js <Quote.pdf> [--expect-pages=7]
 *   node scripts/verifyQuotePdf.js <dir-of-pdfs>
 *
 * Asserts unit presence (10.01, BOQ, Note, matrix rows), no leaked Excel CSS,
 * and prints density vs theoretical min page count.
 */
const fs = require('fs');
const path = require('path');

async function loadPdfParse() {
    try {
        return require('pdf-parse');
    } catch {
        const alt = path.join(
            process.env.TEMP || process.env.TMP || '/tmp',
            'ems-pdf-parse2',
            'node_modules',
            'pdf-parse'
        );
        return require(alt);
    }
}

const REQUIRED_ONCE = [
    { id: 'heading-10-qa', re: /10\.\s*Quality Assurance/i },
    { id: 'clause-10.01', re: /10\.01/ },
    { id: 'heading-3-assumptions', re: /3\.\s*Assumptions/i },
    { id: 'clause-3.01', re: /3\.01/ },
    { id: 'heading-5-gc', re: /5\.\s*General Conditions/i },
    { id: 'heading-7', re: /7\.\s*/ },
    { id: 'clause-7.04', re: /7\.04/ },
    { id: 'heading-12-notes', re: /12\.\s*Notes/i },
    { id: 'heading-13-matrix', re: /13\.\s*Responsibility Matrix/i },
    { id: 'boq-note', re: /\bNote\s*:/i },
    { id: 'boq-p1', re: /\bP1\b/ },
    { id: 'boq-p11', re: /\bP11\b/ },
    { id: 'matrix-row-1', re: /\b1\s+Soil investigation\b/i },
    { id: 'matrix-row-13', re: /\b13\s+.*(?:Permits|underground)/i },
    { id: 'matrix-row-28', re: /\b28\s+Plastic sleeves\b/i },
    { id: 'matrix-row-31', re: /\b31\s+Arranging access\b/i },
];

const FORBIDDEN = [
    { id: 'leaked-xl-css', re: /\.xl\d+\s*\{/i },
    { id: 'leaked-font-family-css', re: /font-family\s*:\s*Arial[^.]{0,40}\}/i },
];

function countMatches(text, re) {
    const m = String(text || '').match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`));
    return m ? m.length : 0;
}

async function verifyOne(pdfPath, expectPages) {
    const { PDFParse } = await loadPdfParse();
    const buf = fs.readFileSync(pdfPath);
    const parser = new PDFParse({ data: buf });
    const info = await parser.getInfo();
    const text = await parser.getText();
    const pages = text.pages || [];
    const full = pages.map((p) => p.text || '').join('\n\n---PAGE---\n\n');

    console.log('\nPDF:', pdfPath);
    console.log('pages:', info.total);
    const bodyChars = full.replace(/\s+/g, ' ').length;
    const theoryCont = Math.max(1, Math.ceil(bodyChars / (90 * 38)));
    console.log(
        `approx density: ${bodyChars} chars → ~${theoryCont} continuation sheets (+1 cover ≈ ${theoryCont + 1} total)`
    );
    console.log(`content-height estimate / 220mm ≈ ${theoryCont} (chars proxy)`);

    let failed = 0;
    if (expectPages > 0 && info.total !== expectPages) {
        console.error(`FAIL page-count: got ${info.total}, expected ${expectPages}`);
        failed += 1;
    }

    for (const unit of REQUIRED_ONCE) {
        const n = countMatches(full, unit.re);
        if (n === 0) {
            console.error(`FAIL missing: ${unit.id}`);
            failed += 1;
        } else if (n > 3) {
            console.error(`FAIL duplicated (${n}): ${unit.id}`);
            failed += 1;
        } else {
            console.log(`OK: ${unit.id} (n=${n})`);
        }
    }

    for (const bad of FORBIDDEN) {
        if (bad.re.test(full)) {
            console.error(`FAIL forbidden text: ${bad.id}`);
            failed += 1;
        } else {
            console.log(`OK absent: ${bad.id}`);
        }
    }

    /* Order: 10.01 should appear after "10. Quality Assurance" */
    const i10h = full.search(/10\.\s*Quality Assurance/i);
    const i1001 = full.search(/10\.01/);
    if (i10h >= 0 && i1001 >= 0 && i1001 < i10h) {
        console.error('FAIL order: 10.01 before heading 10');
        failed += 1;
    }

    return failed;
}

async function main() {
    const args = process.argv.slice(2);
    const expectPages = Number((args.find((a) => a.startsWith('--expect-pages=')) || '').split('=')[1] || 0);
    const targets = args.filter((a) => !a.startsWith('--'));
    if (!targets.length) {
        console.error('Usage: node scripts/verifyQuotePdf.js <Quote.pdf|dir> [--expect-pages=7]');
        process.exit(2);
    }

    const files = [];
    for (const t of targets) {
        if (fs.existsSync(t) && fs.statSync(t).isDirectory()) {
            files.push(
                ...fs
                    .readdirSync(t)
                    .filter((f) => /\.pdf$/i.test(f))
                    .map((f) => path.join(t, f))
            );
        } else {
            files.push(t);
        }
    }

    let failed = 0;
    for (const f of files) {
        if (!fs.existsSync(f)) {
            console.error('missing file:', f);
            failed += 1;
            continue;
        }
        failed += await verifyOne(f, expectPages);
    }
    if (failed) {
        console.error(`\nFAILED checks: ${failed}`);
        process.exit(1);
    }
    console.log('\nAll checks passed.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
