/**
 * Log per-sheet heights before Puppeteer PDF render (PM2 stdout).
 * Enable: EMS_QUOTE_PDF_PERF_LOG=1 or EMS_QUOTE_PDF_DEBUG_PAGINATION=1
 */

function isPaginationDebugEnabled() {
    const on = (v) => String(v || '').trim() === '1' || /^true$/i.test(String(v || ''));
    return on(process.env.EMS_QUOTE_PDF_DEBUG_PAGINATION) || on(process.env.EMS_QUOTE_PDF_PERF_LOG);
}

/**
 * @param {import('puppeteer').Page} page
 */
async function logQuotePdfPaginationDiagnostics(page) {
    if (!isPaginationDebugEnabled()) return null;
    const stats = await page.evaluate(() => {
        const preview = document.getElementById('quote-preview');
        if (!preview) return { sheetCount: 0, sheets: [], error: 'no #quote-preview' };
        const sheets = [...preview.querySelectorAll('.quote-a4-sheet')];
        const mmPerPx = 25.4 / 96;
        return {
            sheetCount: sheets.length,
            viewport: { w: window.innerWidth, h: window.innerHeight },
            sheets: sheets.map((sheet, index) => {
                const content = sheet.querySelector('.content-section');
                const sr = sheet.getBoundingClientRect();
                const cr = content?.getBoundingClientRect();
                return {
                    index,
                    continuation: sheet.classList.contains('quote-a4-sheet--continuation'),
                    sheetPx: Math.round(sr.height),
                    sheetMm: Math.round(sr.height * mmPerPx),
                    contentPx: cr ? Math.round(cr.height) : 0,
                    scrollPx: Math.round(sheet.scrollHeight),
                };
            }),
        };
    });
    console.log('[quote-pdf][pagination]', JSON.stringify(stats));
    return stats;
}

module.exports = { isPaginationDebugEnabled, logQuotePdfPaginationDiagnostics };
