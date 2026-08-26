/**
 * Diagnose landscape PDF page count + layout for latest temp HTML.
 * Run: node server/scripts/diag-landscape-pdf.js
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const dir = path.join(process.env.TEMP || require('os').tmpdir(), 'ems-quote-pdf');
const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
const htmlPath = path.join(dir, files[0]);
const html = fs.readFileSync(htmlPath, 'utf8');

function mmToPx(mm) {
    return Math.round((parseFloat(mm) / 25.4) * 96);
}

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.emulateMediaType('screen');
    await page.setViewport({ width: 1200, height: 1700, deviceScaleFactor: 1 });
    await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });

    const sheetIdx = 1;
    const w = '297mm';
    const h = '210mm';
    const pxW = mmToPx(297);

    await page.evaluate(
        (idx, sw, sh) => {
            const preview = document.getElementById('quote-preview');
            if (preview) {
                preview.style.setProperty('width', sw, 'important');
                preview.style.setProperty('min-width', '0', 'important');
                preview.style.setProperty('max-width', 'none', 'important');
                preview.style.setProperty('margin', '0', 'important');
            }
            document.body.style.setProperty('display', 'block', 'important');
            document.body.style.setProperty('width', sw, 'important');
            document.querySelectorAll('#quote-preview .quote-a4-sheet').forEach((s, j) => {
                if (j === idx) {
                    s.style.setProperty('display', 'grid', 'important');
                    s.style.setProperty('width', sw, 'important');
                    s.style.setProperty('margin', '0', 'important');
                } else {
                    s.style.setProperty('display', 'none', 'important');
                }
            });
        },
        sheetIdx,
        w,
        h
    );

    await page.setViewport({ width: pxW, height: mmToPx(210), deviceScaleFactor: 1 });

    const layout = await page.evaluate(() => {
        const sheet = document.querySelectorAll('#quote-preview .quote-a4-sheet')[1];
        const preview = document.getElementById('quote-preview');
        const sr = sheet?.getBoundingClientRect();
        const pr = preview?.getBoundingClientRect();
        return {
            sheetWidth: sr?.width,
            previewWidth: pr?.width,
            sheetInline: sheet?.getAttribute('style')?.slice(0, 200),
            previewMinWidth: preview?.style?.minWidth,
        };
    });
    console.log('layout after isolate:', layout);

    for (const pageIndex of [0, 1]) {
        const buf = await page.pdf({
            printBackground: true,
            width: w,
            height: h,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            preferCSSPageSize: false,
            pageRanges: String(pageIndex + 1),
        });
        const out = path.join(dir, `diag-landscape-page-${pageIndex}.pdf`);
        fs.writeFileSync(out, buf);
        console.log('wrote', out, 'bytes', buf.length);
    }

    const full = await page.pdf({
        printBackground: true,
        width: w,
        height: h,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        preferCSSPageSize: false,
    });
    const doc = await require('pdf-lib').PDFDocument.load(full);
    console.log('full pdf page count:', doc.getPageCount());

    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
