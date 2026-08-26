const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const dir = path.join(process.env.TEMP || require('os').tmpdir(), 'ems-quote-pdf');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && !f.startsWith('diag'));
files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
const htmlPath = path.join(dir, files[0]);

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
    await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });

    const sheetIdx = 1;
    const w = '297mm';
    const h = '210mm';

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
                    s.style.setProperty('min-width', sw, 'important');
                    s.style.setProperty('max-width', sw, 'important');
                    s.style.setProperty('height', sh, 'important');
                    s.style.setProperty('min-height', sh, 'important');
                    s.style.setProperty('max-height', sh, 'important');
                    s.style.setProperty('margin', '0', 'important');
                    ['page-break-before', 'page-break-after', 'break-before', 'break-after'].forEach((prop) => {
                        s.style.setProperty(prop, 'auto', 'important');
                    });
                } else {
                    s.style.setProperty('display', 'none', 'important');
                }
            });
        },
        sheetIdx,
        w,
        h
    );

    await page.setViewport({ width: mmToPx(297), height: mmToPx(210), deviceScaleFactor: 1 });

    const layout = await page.evaluate(() => {
        const sheet = document.querySelectorAll('#quote-preview .quote-a4-sheet')[1];
        const sr = sheet?.getBoundingClientRect();
        return { sheetWidth: sr?.width };
    });
    console.log('layout with max-width fix:', layout);

    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
