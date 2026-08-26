/**
 * Diagnose actual PDF page dimensions for each sheet orientation.
 * Run: node server/scripts/diag-page-dims.js
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const puppeteer = require('puppeteer');

const dir = path.join(require('os').tmpdir(), 'ems-quote-pdf');
const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
const htmlPath = path.join(dir, files[0]);
console.log('Using HTML:', htmlPath);

function mmToPx(mm) {
    return Math.round((mm / 25.4) * 96);
}

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.emulateMediaType('screen');
    await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });

    const sheetInfos = await page.evaluate(() =>
        [...document.querySelectorAll('#quote-preview .quote-a4-sheet')].map((s, i) => ({
            i,
            isLandscape:
                s.classList.contains('quote-a4-sheet--landscape') ||
                s.getAttribute('data-page-orientation') === 'landscape',
            orient: s.getAttribute('data-page-orientation'),
        }))
    );
    console.log('Sheets:', JSON.stringify(sheetInfos, null, 2));

    const mergedDoc = await PDFDocument.create();

    for (let idx = 0; idx < sheetInfos.length; idx++) {
        const { isLandscape } = sheetInfos[idx];
        const w = isLandscape ? '297mm' : '210mm';
        const h = isLandscape ? '210mm' : '297mm';

        await page.evaluate(
            (sheetIndex, sw, sh) => {
                document.querySelectorAll('style').forEach((st) => {
                    if (st.id === 'ems-isolated-page-size') return;
                    st.textContent = st.textContent.replace(/@page[^{]*\{[^}]*\}/g, '');
                });
                document.getElementById('ems-page-rules')?.remove();
                let pageSizeStyle = document.getElementById('ems-isolated-page-size');
                if (!pageSizeStyle) {
                    pageSizeStyle = document.createElement('style');
                    pageSizeStyle.id = 'ems-isolated-page-size';
                    document.head.appendChild(pageSizeStyle);
                }
                pageSizeStyle.textContent = `@page { size: ${sw} ${sh}; margin: 0; }`;

                const preview = document.getElementById('quote-preview');
                if (preview) {
                    preview.style.setProperty('width', sw, 'important');
                    preview.style.setProperty('margin', '0', 'important');
                }
                document.body.style.setProperty('width', sw, 'important');
                document.querySelectorAll('#quote-preview .quote-a4-sheet').forEach((s, j) => {
                    if (j === sheetIndex) {
                        s.style.setProperty('display', 'grid', 'important');
                        s.style.setProperty('width', sw, 'important');
                        s.style.setProperty('height', sh, 'important');
                        s.style.setProperty('page', 'auto', 'important');
                    } else {
                        s.style.setProperty('display', 'none', 'important');
                    }
                });
            },
            idx,
            w,
            h
        );

        await page.setViewport({
            width: mmToPx(parseFloat(w)),
            height: mmToPx(parseFloat(h)),
            deviceScaleFactor: 1,
        });

        const buf = await page.pdf({
            printBackground: true,
            width: w,
            height: h,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            preferCSSPageSize: false,
        });

        const sheetDoc = await PDFDocument.load(buf);
        const pg = sheetDoc.getPage(0);
        const { width, height } = pg.getSize();
        const rotate = pg.getRotation().angle;
        console.log(
            `Sheet ${idx} (${isLandscape ? 'landscape' : 'portrait'}):`,
            `pdf=${width.toFixed(1)}x${height.toFixed(1)}`,
            `rotate=${rotate}`,
            `srcPages=${sheetDoc.getPageCount()}`,
            `bytes=${buf.length}`
        );

        const [sheetPage] = await mergedDoc.copyPages(sheetDoc, [0]);
        mergedDoc.addPage(sheetPage);
    }

    const mergedBuf = Buffer.from(await mergedDoc.save());
    const finalDoc = await PDFDocument.load(mergedBuf);
    console.log('\nMerged PDF pages:');
    for (let i = 0; i < finalDoc.getPageCount(); i++) {
        const pg = finalDoc.getPage(i);
        const { width, height } = pg.getSize();
        const rotate = pg.getRotation().angle;
        console.log(`  Page ${i + 1}: ${width.toFixed(1)}x${height.toFixed(1)} rotate=${rotate}`);
    }

    const outPath = path.join(dir, 'diag-merged-dims.pdf');
    fs.writeFileSync(outPath, mergedBuf);
    console.log('\nWrote', outPath);

    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
