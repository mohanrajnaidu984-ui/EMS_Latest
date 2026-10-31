import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { EMS_E2E_ADMIN, seedEmsAuthInBrowser, openEnquiryQuotePreview, clickAlignPage, measurePaginationHealth } from './helpers/emsSession.js';

test('1515 independent preview investigation', async ({ browser }) => {
    test.setTimeout(600000);
    const page = await browser.newPage({ viewport: { width: 1600, height: 1500 }, acceptDownloads: true });
    const dir = 'e2e/artifacts/independent-investigation';
    fs.mkdirSync(dir, { recursive: true });
    page.on('pageerror', error => console.log('PAGE_ERROR', error.message));
    const pdfRequests = [];
    page.on('request', request => {
        if (request.url().endsWith('/api/quote-pdf/generate') && request.postData()) {
            fs.writeFileSync(`${dir}/pdf-request.json`, request.postData());
        }
    });
    page.on('requestfailed', request => {
        if (request.url().includes('quote-pdf')) console.log('PDF_NETWORK_ERROR', request.url(), request.failure()?.errorText);
    });
    page.on('response', response => {
        if (response.url().includes('quote-pdf')) {
            pdfRequests.push({ url: response.url(), status: response.status() });
            console.log('PDF_HTTP', response.status(), response.url());
        }
    });
    await page.addInitScript(seedEmsAuthInBrowser, EMS_E2E_ADMIN);
    console.log('OPEN', test.info().project.use.baseURL);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    console.log('LOADED');
    try {
        await openEnquiryQuotePreview(page, '1515');
        console.log('PREVIEW_OPEN');
        await page.getByLabel('Previous Quotes / Revisions (Updated)', { exact: true }).check();
        await page.waitForTimeout(3000);
        await page.evaluate(() => {
            const label = [...document.querySelectorAll('span')].find(n => /^SMA\/SXP\/1515-L1\/1504-R\d+$/.test(n.textContent.trim()));
            let card = label;
            while (card && !card.querySelector('svg.lucide-chevron-down')) card = card.parentElement;
            card?.querySelector('svg.lucide-chevron-down')?.parentElement.click();
        });
        await page.getByText('SMA/SXP/1515-L1/1504-R4', { exact: true }).first().click();
        await page.waitForTimeout(4000);
        console.log('SAVED_R4_SELECTED');
        const results = [];
        for (let i = 0; i < 3; i++) {
            await clickAlignPage(page);
            const health = await measurePaginationHealth(page);
            const groups = await page.locator('#quote-preview .quote-a4-sheet--continuation').evaluateAll(sheets => sheets.map(sheet => [...new Set([...sheet.querySelectorAll('[data-ems-pack-seg]')].map(n => n.dataset.emsPackSeg))]));
            results.push({ health, groups });
            fs.writeFileSync(`${dir}/measured.json`, await page.locator('#quote-print-root #quote-preview').getAttribute('data-ems-pack-measure-results') || '[]');
            fs.writeFileSync(`${dir}/live-metrics.json`, JSON.stringify(await page.locator('#quote-print-root #quote-preview .quote-a4-sheet--continuation').evaluateAll(sheets => sheets.map(sheet => {
                const content = sheet.querySelector('.content-section');
                const top = content.getBoundingClientRect().top;
                const scale = content.getBoundingClientRect().width / content.offsetWidth;
                return [...content.querySelectorAll('[data-ems-pack-seg]')].map(el => {
                    const rect = el.getBoundingClientRect();
                    const cell = el.querySelector('td,th') || el;
                    const style = getComputedStyle(cell);
                    return { id: el.dataset.emsPackSeg, bottom: (rect.bottom - top) / scale,
                        height: rect.height / scale, width: rect.width / scale, cellWidth: cell.getBoundingClientRect().width / scale,
                        font: style.font, padding: style.padding, text: el.textContent.slice(0, 80) };
                });
            })), null, 2));
            fs.writeFileSync(`${dir}/preview.json`, JSON.stringify(results, null, 2));
            console.log('ALIGN', i + 1, JSON.stringify({ sheets: health.totalSheets, overflow: health.overflows.length, sparse: health.sparseSheets, integrity: health.integrityBanner }));
        }
        const sheets = page.locator('#quote-preview .quote-a4-sheet');
        // Vite reloads every client when an HTML file appears in its project tree.
        fs.writeFileSync(`${dir}/live-markup.txt`, await page.locator('#quote-print-root #quote-preview').evaluate(root => root.outerHTML));
        for (let i = 0; i < await sheets.count(); i++) {
            await sheets.nth(i).scrollIntoViewIfNeeded();
            await sheets.nth(i).screenshot({ path: `${dir}/preview-page-${i + 1}.png` });
        }
        expect(results[0].health.overflows).toHaveLength(0);
        expect(results[0].health.integrityBanner).toBe(false);
        expect(results[1].groups).toEqual(results[0].groups);
        expect(results[2].groups).toEqual(results[0].groups);
        const assigned = results[0].groups.flat().map(Number);
        expect(assigned).toEqual(Array.from({ length: assigned.length }, (_, i) => i));
        expect(results[0].health.uniqueSegs).toBe(assigned.length);
        expect(results[0].health.duplicateSegs).toEqual([]);
        expect(results[0].health.sparseSheets).toEqual([]);
        const zoomChecks = [];
        for (const zoom of [0.8, 1, 1.25]) {
            await page.locator('.quote-preview-zoom-shell').evaluate((shell, z) => {
                shell.style.transform = `scale(${z})`;
                shell.style.setProperty('--quote-preview-zoom', String(z));
            }, zoom);
            const health = await measurePaginationHealth(page);
            zoomChecks.push({ zoom, overflows: health.overflows, sheets: health.totalSheets });
            expect(health.overflows).toEqual([]);
            expect(health.totalSheets).toBe(results[0].health.totalSheets);
        }
        await page.locator('.quote-preview-zoom-shell').evaluate(shell => {
            shell.style.transform = 'scale(1)';
            shell.style.setProperty('--quote-preview-zoom', '1');
        });
        fs.writeFileSync(`${dir}/zoom.json`, JSON.stringify(zoomChecks, null, 2));
        const previewPages = await page.locator('#quote-preview .quote-a4-sheet').evaluateAll(sheets => sheets.map(sheet => [...sheet.querySelectorAll('.quote-clause-block')].map(n => n.innerText)));
        const alerts = [];
        page.on('dialog', async dialog => { alerts.push(dialog.message()); console.log('PDF_ALERT', dialog.message()); await dialog.accept(); });
        const button = page.getByRole('button', { name: /Download quote PDF|Save quote as PDF|Download PDF|Save as PDF/i }).first();
        const pendingDownload = page.waitForEvent('download', { timeout: 180000 });
        console.log('PDF_REQUEST');
        await button.click();
        const download = await pendingDownload;
        const pdfPath = `${dir}/quote-1515-R4.pdf`;
        await download.saveAs(pdfPath);
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
        const pdf = await parser.getText();
        await parser.destroy();
        const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
        const parity = previewPages.map((blocks, index) => {
            const pdfText = pdf.pages[index]?.text || '';
            const haystack = normalize(pdfText);
            let cursor = 0;
            const checks = blocks.map(text => {
                const needle = normalize(text);
                const at = haystack.indexOf(needle, cursor);
                if (at >= 0) cursor = at + needle.length;
                return { matches: at >= 0, preview: text };
            });
            return { page: index + 1, matches: checks.every(b => b.matches), blocks: checks, pdf: pdfText };
        });
        fs.writeFileSync(`${dir}/pdf-parity.json`, JSON.stringify({ alerts, previewCount: previewPages.length, pdfCount: pdf.total, parity }, null, 2));
        console.log('PDF_RESULT', JSON.stringify({ pages: pdf.total, previewPages: previewPages.length, mismatches: parity.filter(p => !p.matches).map(p => p.page) }));
        expect(pdf.total).toBe(previewPages.length);
        expect(parity.filter(p => !p.matches)).toEqual([]);
        // A warm cached PDF must not bypass a fresh live-visibility check.
        await page.locator('#quote-print-root #quote-preview .quote-a4-sheet--continuation .content-section').first().evaluate(content => {
            const probe = document.createElement('div');
            probe.dataset.emsPackSeg = '999999';
            probe.style.cssText = 'position:absolute;top:0;left:0;height:2400px;width:10px';
            probe.textContent = 'overflow probe';
            content.appendChild(probe);
        });
        const blockedDownload = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
        await button.click();
        expect(await blockedDownload).toBeNull();
        expect(alerts.some(message => /pagination integrity/i.test(message))).toBe(true);
        fs.writeFileSync(`${dir}/export-gate.json`, JSON.stringify({ blocked: true, alerts }, null, 2));
    } finally {
        fs.writeFileSync(`${dir}/pdf-network.json`, JSON.stringify(pdfRequests, null, 2));
        await page.screenshot({ path: `${dir}/last-screen.png` }).catch(() => {});
        await page.close();
    }
});
