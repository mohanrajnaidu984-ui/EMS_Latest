const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const { PDFDocument, decodePDFRawStream } = require('pdf-lib');
const source = fs.readFileSync(require.resolve('../../routes/quotePdf.js'), 'utf8');
const context = { PDFDocument, quotePdfPageTimeoutMs: () => 10000, pdfStepLog() {}, console,
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; } };
const rendererFunctions = [];
for (const name of ['enableQuotePdfHairlineRendering', 'renderPortraitPdfBuffer', 'mmToPx',
    'setPdfViewportForSheet', 'isolateQuoteSheetForPdfRender', 'restoreAllQuoteSheetsAfterPdfRender', 'renderMixedOrientationPdfBuffer']) {
    const match = source.match(new RegExp('(?:async )?function ' + name + '\\([^]*?^}', 'm'));
    if (!match) throw new Error('Missing renderer: ' + name);
    rendererFunctions.push(match[0]);
}
Object.assign(context, new Function(...Object.keys(context), rendererFunctions.join('\n') + '\nreturn {renderPortraitPdfBuffer, renderMixedOrientationPdfBuffer};')(...Object.values(context)));

test('PDF hairlines retain thin strokes, A4 size and portrait/landscape pagination', async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const html = (landscape = false) => '<style>@page{size:A4;margin:0}body{margin:0}.quote-a4-sheet{width:210mm;height:297mm;box-sizing:border-box;padding:15mm;break-after:page}.quote-a4-sheet--landscape{width:297mm;height:210mm}.line{width:100px;height:20px;border:0.5px solid navy}</style><div id="quote-print-root"><div id="quote-preview"><div class="quote-a4-sheet"><div class="line">One</div></div><div class="quote-a4-sheet' + (landscape ? ' quote-a4-sheet--landscape' : '') + '"><div class="line">Two</div></div></div></div>';
        await page.setContent(html());
        const pdf = await PDFDocument.load(await context.renderPortraitPdfBuffer(page));
        assert.equal(pdf.getPageCount(), 2);
        assert.ok(Math.abs(pdf.getPages()[0].getWidth() - 595.28) < 1);
        assert.equal(await page.$eval('.line', el => getComputedStyle(el).borderTopWidth), '0.5px');
        // Chromium emits a 1-unit stroke under a 0.375pt transform (0.5 CSS px).
        const contents = pdf.getPages()[0].node.Contents();
        const stream = (contents.asArray ? contents.asArray() : [contents]).map(ref => Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString()).join('');
        assert.match(stream, /1\.5625 0 0 1\.5625/);
        assert.match(stream, /201 41 re/);
        await page.setContent(html(true));
        const mixed = await PDFDocument.load(await context.renderMixedOrientationPdfBuffer(page, [{ isLandscape: false }, { isLandscape: true }]));
        assert.equal(mixed.getPageCount(), 2);
        assert.ok(mixed.getPages()[0].getWidth() < mixed.getPages()[0].getHeight());
        assert.ok(mixed.getPages()[1].getWidth() > mixed.getPages()[1].getHeight());
    } finally { await browser.close(); }
});
