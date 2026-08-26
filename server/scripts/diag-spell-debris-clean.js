/**
 * Verify spell-mark debris cleanup on real exported HTML snippet.
 */
const fs = require('fs');
const path = require('path');

// Minimal copy of cleanup regex (keep in sync with clauseEditorSpellcheck.js)
function stripSpellMarkExportDebrisFromHtmlString(html) {
    let s = String(html || '');
    if (!s) return s;
    s = s.replace(/<span\b[^>]*\bclass="[^"]*\bems-spell-mark\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, '$1');
    s = s.replace(/<span\b[^>]*\bdata-spell-id\b[^>]*>([\s\S]*?)<\/span>/gi, '$1');
    s = s.replace(
        /!?important;background-repeat:repeat-x !important;background-position:0 100% !important;background-size:100% 2px !important;padding-bottom:1px !important;text-decoration:none !important;[\s\S]*?(?:&gt;|>)/gi,
        ''
    );
    s = s.replace(/<span\b[^>]*\bems-spell-mark\b[^>]*>/gi, '');
    s = s.replace(/\s*data-suggestions=(?:"[^"]*"|\[[^\]]*\]|&quot;\[[^\]]*\]&quot;)\s*/gi, ' ');
    return s;
}

const dir = path.join(require('os').tmpdir(), 'ems-quote-pdf');
const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
const html = fs.readFileSync(path.join(dir, files[0]), 'utf8');
const idx = html.indexOf('4.1. Our [Lump sum');
const snippet = html.slice(idx, idx + 2500);
console.log('BEFORE (snippet):');
console.log(snippet.slice(0, 800));
const cleaned = stripSpellMarkExportDebrisFromHtmlString(snippet);
console.log('\nAFTER (snippet):');
console.log(cleaned.slice(0, 800));
const bad = /!important;background-repeat|data-suggestions/.test(cleaned);
console.log('\nStill has debris?', bad);
