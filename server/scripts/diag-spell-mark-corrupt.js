/**
 * Reproduce spell-mark corruption in PDF HTML pipeline.
 */

const SPELL_MARK_INLINE_STYLE =
    'border-bottom:2px wavy #0078d4 !important;' +
    'background-image:linear-gradient(#0078d4,#0078d4) !important;' +
    'background-repeat:repeat-x !important;' +
    'background-position:0 100% !important;' +
    'background-size:100% 2px !important;' +
    'padding-bottom:1px !important;' +
    'text-decoration:none !important;';

const PDF_SELF_CLOSE_FIX_TAGS = [
    'div',
    'span',
    'p',
    'a',
    'section',
    'article',
    'main',
    'header',
    'footer',
    'label',
    'li',
    'td',
    'th',
    'tr',
    'tbody',
    'thead',
    'table',
    'h1',
    'h2',
    'h3',
];

function fixInvalidSelfClosingTags(html) {
    let out = String(html);
    for (const tag of PDF_SELF_CLOSE_FIX_TAGS) {
        const re = new RegExp(`<${tag}([^>]*?)\\s*\\/\\s*>`, 'gi');
        out = out.replace(re, `<${tag}$1></${tag}>`);
    }
    return out;
}

function stripSpellMarksFromDom(html) {
    // Regex fallback matching unwrapSpellMarks in clauseEditorSpellcheck.js
    return html.replace(
        /<span\b[^>]*\bclass="[^"]*\bems-spell-mark\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
        '$1'
    );
}

function stripAllStyleTags(html) {
    const chunks = [];
    const out = String(html).replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, inner) => {
        chunks.push(inner);
        return '';
    });
    return { css: chunks.join('\n\n'), html: out.trim() };
}

const base =
    '<p>4.1. Our price shall be BD 1,243.000 (Bahraini Dinars One Thousand Two Hundred and Forty Three only.)</p>';

function markWord(html, word) {
    const span = `<span class="ems-spell-mark" data-word="${word}" data-spell-id="1" spellcheck="false" style="${SPELL_MARK_INLINE_STYLE}" data-suggestions='["Bahrain"]'>${word}</span>`;
    return html.replace(word, span);
}

const tests = [
    ['mark Bahraini', markWord(base, 'Bahraini')],
    ['mark Bahrain', markWord(base, 'Bahrain')],
    ['mark full phrase', markWord(base, 'Bahraini Dinars One Thousand Two Hundred and Forty Three only.')],
    ['mark Three', markWord(base, 'Three')],
];

for (const [label, marked] of tests) {
    console.log('\n===', label, '===');
    const pipeline = [
        ['strip then fix', fixInvalidSelfClosingTags(stripSpellMarksFromDom(marked))],
        ['fix then strip', stripSpellMarksFromDom(fixInvalidSelfClosingTags(marked))],
        ['fix only', fixInvalidSelfClosingTags(marked)],
        ['strip only', stripSpellMarksFromDom(marked)],
    ];
    for (const [name, out] of pipeline) {
        const bad = /!important;background-repeat|data-suggestions/.test(out);
        console.log(name, bad ? 'CORRUPT' : 'ok');
        if (bad) console.log(out);
    }
}

// Test if style tag strip eats span content
const withStyle = `<style>.x{}</style>${markWord(base, 'Bahraini')}`;
const { html: noStyle } = stripAllStyleTags(withStyle);
console.log('\n=== stripAllStyleTags ===');
console.log(fixInvalidSelfClosingTags(stripSpellMarksFromDom(noStyle)));
