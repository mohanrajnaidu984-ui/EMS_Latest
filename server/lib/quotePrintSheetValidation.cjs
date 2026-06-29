/**
 * Puppeteer: prune empty .quote-a4-sheet nodes (keep in sync with quotePrintSheetValidation.js).
 */
function quoteSheetHasBodyContent(sheetEl) {
    if (!sheetEl || !sheetEl.querySelector) return false;
    const sels = [
        '.quote-cover-first-page',
        '.header-section',
        '.quote-clause-block',
        '.quote-digital-signature-stamp',
        '.clause-content table',
        '.clause-content img',
    ];
    for (const sel of sels) {
        const nodes = sheetEl.querySelectorAll(sel);
        for (const node of nodes) {
            if (node.matches && node.matches('img[src]') && node.getAttribute('src')) return true;
            if (node.matches && node.matches('table')) return true;
            if (node.matches && node.matches('.quote-digital-signature-stamp')) return true;
            const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
            if (text.length > 0) return true;
        }
    }
    const content = sheetEl.querySelector('.quote-sheet-main-flex .content-section');
    if (content) {
        const prose = (content.innerText || '')
            .replace(/\s+/g, ' ')
            .replace(/Page\s+\d+\s+of\s+\d+/gi, '')
            .trim();
        if (prose.length > 12) return true;
    }
    return false;
}

function renumberQuoteSheetPageIndicators(previewRoot) {
    const sheets = [...previewRoot.querySelectorAll('.quote-a4-sheet')];
    const total = sheets.length;
    sheets.forEach((sheet, i) => {
        const ind = sheet.querySelector('.quote-print-page-indicator');
        if (ind) ind.textContent = `Page ${i + 1} of ${total}`;
    });
}

function pruneEmptyQuoteSheetsInDocument() {
    const preview = document.getElementById('quote-preview');
    if (!preview) return 0;
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

    if (removed > 0) renumberQuoteSheetPageIndicators(preview);

    const finalSheets = [...preview.querySelectorAll('.quote-a4-sheet')];
    const lastSheet = finalSheets[finalSheets.length - 1];
    if (lastSheet) {
        lastSheet.style.setProperty('page-break-after', 'avoid', 'important');
        lastSheet.style.setProperty('break-after', 'avoid', 'important');
    }

    return removed;
}

module.exports = { pruneEmptyQuoteSheetsInDocument };
