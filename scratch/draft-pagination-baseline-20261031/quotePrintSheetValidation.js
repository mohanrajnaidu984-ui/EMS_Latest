/**
 * Detect / remove empty quote A4 sheets before PDF export (prevents blank PDF pages).
 */

const BODY_CONTENT_SELECTORS = [
    '.quote-cover-first-page',
    '.header-section',
    '.quote-clause-block',
    '.quote-digital-signature-stamp',
    '.clause-content table',
    '.clause-content img',
];

function nodeHasVisibleText(el) {
    if (!el || el.nodeType !== 1) return false;
    const text = String(el.innerText || el.textContent || '')
        .replace(/\u00a0/g, ' ')
        .trim();
    return text.length > 0;
}

/**
 * True when the sheet has real body content (not logo/footer/page number alone).
 * @param {Element} sheetEl
 */
export function quoteSheetHasBodyContent(sheetEl) {
    if (!sheetEl || !sheetEl.querySelector) return false;

    for (const sel of BODY_CONTENT_SELECTORS) {
        const nodes = sheetEl.querySelectorAll(sel);
        for (const node of nodes) {
            if (node.matches?.('img[src]') && node.getAttribute('src')) return true;
            if (node.matches?.('table')) return true;
            if (node.matches?.('.quote-digital-signature-stamp')) return true;
            if (nodeHasVisibleText(node)) return true;
        }
    }

    const main = sheetEl.querySelector('.quote-sheet-main-flex');
    const content = main?.querySelector('.content-section');
    if (content) {
        const prose = String(content.innerText || '')
            .replace(/\u00a0/g, ' ')
            .replace(/Page\s+\d+\s+of\s+\d+/gi, '')
            .trim();
        if (prose.length > 12) return true;
    }

    return false;
}

/**
 * Remove continuation sheets with no body content; renumber page indicators.
 * @param {ParentNode} root #quote-print-root or clone
 * @returns {number} sheets removed
 */
export function removeEmptyQuoteA4Sheets(root) {
    if (!root?.querySelectorAll) return 0;
    const preview = root.querySelector('#quote-preview') || root;
    let removed = 0;

    preview.querySelectorAll('.quote-a4-sheet--word-flow-extra, [data-word-flow-extra]').forEach((el) => {
        el.remove();
        removed += 1;
    });
    preview.querySelectorAll('.quote-clause-word-flow-ribbon').forEach((el) => {
        el.remove();
        removed += 1;
    });

    let sheets = [...preview.querySelectorAll('.quote-a4-sheet')];
    while (sheets.length > 1) {
        const last = sheets[sheets.length - 1];
        if (!quoteSheetHasBodyContent(last)) {
            last.remove();
            removed += 1;
            sheets = [...preview.querySelectorAll('.quote-a4-sheet')];
        } else {
            break;
        }
    }

    sheets = [...preview.querySelectorAll('.quote-a4-sheet')];
    sheets.forEach((sheet, idx) => {
        if (idx === 0) return;
        if (!quoteSheetHasBodyContent(sheet)) {
            sheet.remove();
            removed += 1;
        }
    });

    if (removed > 0) {
        renumberQuoteSheetPageIndicators(preview);
    }
    return removed;
}

/**
 * @param {ParentNode} previewRoot #quote-preview
 */
export function renumberQuoteSheetPageIndicators(previewRoot) {
    if (!previewRoot?.querySelectorAll) return;
    const sheets = [...previewRoot.querySelectorAll('.quote-a4-sheet')];
    const total = sheets.length;
    sheets.forEach((sheet, i) => {
        const ind = sheet.querySelector('.quote-print-page-indicator');
        if (!ind) return;
        ind.textContent = `Page ${i + 1} of ${total}`;
    });
}

/**
 * @param {number[][]} groups
 * @param {Array<{ html?: string }>} segments
 */
export function filterEmptySegmentPageGroups(groups, segments) {
    if (!groups?.length) return [];
    return groups.filter((group) => {
        if (!group?.length) return false;
        return group.some((idx) => {
            const seg = segments[idx];
            return seg && String(seg.html || '').trim().length > 0;
        });
    });
}
