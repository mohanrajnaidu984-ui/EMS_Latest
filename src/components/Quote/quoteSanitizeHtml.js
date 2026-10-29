/**
 * Sanitize quote rich text: strip Excel/Word junk, Symbol fonts,
 * and pull BOQ "Note" rows out of tables so thead is not repeated above Notes.
 */

import { remapSymbolFontGreekInHtml } from './quoteSymbolFont.js';

const ALLOWED_TAGS = new Set([
    'A', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUB', 'SUP', 'BR', 'HR',
    'P', 'DIV', 'SPAN', 'FONT', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH',
    'COLGROUP', 'COL', 'IMG', 'BLOCKQUOTE',
]);

const ALLOWED_ATTRS = new Set([
    'href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'width', 'height',
    'align', 'valign', 'class', 'id', 'style', 'data-ems-indent', 'data-ems-row',
    'data-ems-amount', 'data-ems-pricing-cols', 'data-ems-col-widths',
    'data-ems-row-heights', 'data-ems-paste-source', 'data-ems-heading-custom',
    'start', 'type',
]);

function stripDisallowed(root) {
    root.querySelectorAll('style, script, meta, link, noscript, iframe, object, embed').forEach((el) => {
        el.remove();
    });
    root.querySelectorAll('*').forEach((el) => {
        if (!ALLOWED_TAGS.has(el.tagName)) {
            const parent = el.parentNode;
            if (!parent) return;
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            el.remove();
            return;
        }
        [...el.attributes].forEach((attr) => {
            const n = attr.name.toLowerCase();
            if (n.startsWith('on')) {
                el.removeAttribute(attr.name);
                return;
            }
            if (!ALLOWED_ATTRS.has(n) && !n.startsWith('data-ems-')) {
                el.removeAttribute(attr.name);
            }
        });
        if (el.getAttribute('style')) {
            let style = String(el.getAttribute('style') || '');
            const keepUserFont = el.getAttribute('data-ems-user-font') === '1';
            style = style.replace(/mso-[a-z-]+:[^;]+;?/gi, '');
            /* Strip Office/Excel font-family so text inherits Selawik / Segoe UI pack face. */
            if (!keepUserFont) {
                style = style.replace(/font-family\s*:\s*[^;]+;?/gi, '');
            }
            style = style.trim();
            if (style) el.setAttribute('style', style);
            else el.removeAttribute('style');
        }
        if (el.getAttribute('data-ems-user-font') !== '1') {
            el.removeAttribute('face');
        }
        const cls = String(el.getAttribute('class') || '')
            .split(/\s+/)
            .filter((c) => c && !/^xl\d+$/i.test(c) && !/^mso/i.test(c));
        if (cls.length) el.setAttribute('class', cls.join(' '));
        else el.removeAttribute('class');
    });
}

/** Remove leaked Excel CSS text nodes (e.g. ".xl84 {font-size:...} -->"). */
function stripLeakedCssTextNodes(root) {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    /** @type {Text[]} */
    const doomed = [];
    let n = walker.nextNode();
    while (n) {
        const t = String(n.textContent || '');
        if (
            /\.xl\d+\s*\{/i.test(t) ||
            (/font-family\s*:\s*Arial/i.test(t) && /\{[^}]*\}/.test(t) && t.length < 2000)
        ) {
            doomed.push(/** @type {Text} */ (n));
        }
        n = walker.nextNode();
    }
    doomed.forEach((tn) => {
        tn.textContent = '';
    });
}

/**
 * Convert NBSP / spacer-runs to normal spaces — never delete them (that produced
 * "Soilinvestigation", "Over timeifrequired", etc.).
 */
function normalizeNbspAndSpacerRuns(root) {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    /** @type {Text[]} */
    const nodes = [];
    let n = walker.nextNode();
    while (n) {
        nodes.push(/** @type {Text} */ (n));
        n = walker.nextNode();
    }
    nodes.forEach((tn) => {
        const t = String(tn.textContent || '');
        if (!t) return;
        /* U+00A0 NBSP, U+202F narrow NBSP, U+2007 figure space → normal space; keep word gaps. */
        let next = t
            .replace(/[\u00a0\u202f\u2007\u2009]/g, ' ')
            .replace(/[ \t\f\v]+/g, ' ');
        if (next !== t) tn.textContent = next;
    });
    /* Word mso-spacerun spans that held only NBSP — ensure a real space remains. */
    root.querySelectorAll('span').forEach((span) => {
        const style = String(span.getAttribute('style') || '');
        if (!/mso-spacerun/i.test(style) && !/mso-spacerun/i.test(String(span.className || ''))) {
            return;
        }
        const text = String(span.textContent || '');
        if (!text || /^[\s\u00a0]*$/.test(text)) {
            span.textContent = ' ';
        }
    });
}

function rowLooksLikeNote(row) {
    const text = String(row?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
    return /^notes?\s*:/i.test(text) || /^note\b/i.test(text) || /^:\s*$/.test(text);
}

function isLoneNoteLabelText(text) {
    const t = String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
    return (
        /^notes?\s*:?\s*$/i.test(t) ||
        /^:\s*$/.test(t) ||
        (/^notes?\s*:/i.test(t) && t.length <= 48)
    );
}

/** Move Note rows out of BOQ/schedule tables into sibling prose blocks. */
function extractNoteRowsFromTables(root) {
    root.querySelectorAll('table').forEach((table) => {
        const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.closest('table') === table);
        /** @type {HTMLTableRowElement[]} */
        const noteRows = [];
        rows.forEach((row) => {
            if (rowLooksLikeNote(row)) noteRows.push(/** @type {HTMLTableRowElement} */ (row));
        });
        if (!noteRows.length) return;
        const holder = root.ownerDocument.createElement('div');
        holder.className = 'ems-boq-note-block';
        holder.setAttribute('data-ems-boq-note', '1');
        holder.setAttribute('data-ems-keep-with-next', '1');
        const label = root.ownerDocument.createElement('p');
        label.className = 'ems-boq-note-label';
        label.setAttribute('data-ems-boq-note-label', '1');
        label.innerHTML = '<strong>Note:</strong>';
        holder.appendChild(label);
        noteRows.forEach((row) => {
            const cells = [...(row.cells || [])];
            cells.forEach((c) => {
                const html = String(c.innerHTML || '').trim();
                if (!html) return;
                const text = String(c.textContent || '')
                    .replace(/\s+/g, ' ')
                    .trim();
                if (isLoneNoteLabelText(text)) return;
                if (c.children.length >= 1) {
                    [...c.children].forEach((child) => {
                        const t = String(child.textContent || '')
                            .replace(/\s+/g, ' ')
                            .trim();
                        if (isLoneNoteLabelText(t)) return;
                        holder.appendChild(child.cloneNode(true));
                    });
                    return;
                }
                const p = root.ownerDocument.createElement('p');
                p.innerHTML = html.replace(/^notes?\s*:\s*/i, '');
                if (String(p.textContent || '').trim()) holder.appendChild(p);
            });
            row.remove();
        });
        if (holder.childNodes.length) {
            table.parentNode?.insertBefore(holder, table.nextSibling);
        }
    });
}

/**
 * @param {string} html
 * @returns {string}
 */
export function sanitizeQuoteRichHtml(html) {
    const raw = String(html || '').trim();
    if (!raw) return '';
    if (typeof DOMParser === 'undefined') {
        return raw
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<!--[\s\S]*?-->/g, '');
    }
    let body = remapSymbolFontGreekInHtml(raw);
    body = body
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    const doc = new DOMParser().parseFromString(`<div id="ems-san">${body}</div>`, 'text/html');
    const root = doc.getElementById('ems-san');
    if (!root) return body;
    stripDisallowed(root);
    stripLeakedCssTextNodes(root);
    normalizeNbspAndSpacerRuns(root);
    extractNoteRowsFromTables(root);
    /* Entity form in serialized HTML */
    return root.innerHTML
        .replace(/&nbsp;/gi, ' ')
        .replace(/\u00a0/g, ' ')
        .trim();
}
