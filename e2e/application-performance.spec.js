import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { EMS_E2E_ADMIN, seedEmsAuthInBrowser, openEnquiryQuotePreview, measurePaginationHealth } from './helpers/emsSession.js';

test('measure application reads and large quotation responsiveness', async ({ browser }) => {
    test.setTimeout(600000);
    const label = process.env.EMS_PERF_LABEL || 'baseline';
    const dir = `e2e/artifacts/performance/${label}`;
    fs.mkdirSync(dir, { recursive: true });
    const report = { label, baseURL: test.info().project.use.baseURL, navigation: [], requests: [], console: [], errors: [], startedAt: new Date().toISOString() };
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, acceptDownloads: true });
    await page.addInitScript(seedEmsAuthInBrowser, EMS_E2E_ADMIN);
    await page.addInitScript(() => {
        sessionStorage.setItem('ems_activeTab', 'Dashboard');
        window.__emsPerf = { pending: 0, lastRequest: 0, longTasks: [], stages: [] };
        const background = /\/api\/(usage\/heartbeat|notifications|quotes\/list\/pending-approvals\/count)/;
        const original = window.fetch;
        window.fetch = async function (...args) {
            const url = String(args[0]?.url || args[0]);
            const foreground = url.includes('/api/') && !background.test(url);
            if (foreground) window.__emsPerf.pending++;
            try { return await original.apply(this, args); }
            finally {
                if (foreground) { window.__emsPerf.pending--; window.__emsPerf.lastRequest = performance.now(); }
            }
        };
        try {
            new PerformanceObserver(list => {
                for (const entry of list.getEntries()) window.__emsPerf.longTasks.push({ start: entry.startTime, duration: entry.duration });
            }).observe({ type: 'longtask', buffered: true });
        } catch {}
    });
    const starts = new Map();
    page.on('request', r => starts.set(r, Date.now()));
    page.on('requestfinished', async r => {
        const response = await r.response();
        const sizes = await r.sizes().catch(() => ({}));
        report.requests.push({ path: new URL(r.url()).pathname, method: r.method(), status: response?.status(), ms: Date.now() - (starts.get(r) || Date.now()), bodyBytes: sizes.responseBodySize || 0 });
    });
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', message => {
        const text = message.text();
        if (/QuotePerf|EMS pack|Maximum update|error/i.test(text)) report.console.push(text.slice(0, 1500));
    });
    const idle = async () => {
        await page.waitForFunction(() => !document.querySelector('[data-ems-module-loading]'), undefined, { timeout: 90000 });
        await page.waitForFunction(() => window.__emsPerf.pending === 0 && performance.now() - window.__emsPerf.lastRequest > 400, undefined, { timeout: 60000 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    try {
        const started = Date.now();
        await page.goto('/?emsQuotePerf=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.locator('[data-ems-main-nav-id="Dashboard"]').waitFor();
        report.shellReadyMs = Date.now() - started;
        await idle().catch(e => report.errors.push(`initial idle: ${e.message}`));
        report.initialDataReadyMs = Date.now() - started;
        report.availableModules = await page.locator('[data-ems-main-nav-id]').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.emsMainNavId, text: n.textContent.trim() })));
        console.log('STARTUP', report.shellReadyMs, report.initialDataReadyMs);
        for (const id of ['Dashboard', 'Enquiry', 'Pricing', 'Probability', 'Sales Report', 'Reports', 'Approvals', 'Usage', 'Help', 'About']) {
            const button = page.locator(`[data-ems-main-nav-id="${id}"]`);
            if (!await button.count()) continue;
            const at = Date.now();
            const reqStart = report.requests.length;
            await button.click();
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
            const firstPaintMs = Date.now() - at;
            let settled = true;
            await idle().catch(() => { settled = false; });
            report.navigation.push({ module: id, firstPaintMs, dataReadyMs: Date.now() - at, settled, requests: report.requests.length - reqStart });
            console.log('MODULE', JSON.stringify(report.navigation.at(-1)));
        }
        const quoteStart = Date.now();
        await openEnquiryQuotePreview(page, '1515');
        report.quoteOpenHelperMs = Date.now() - quoteStart;
        // Explicitly load the saved R4 revision used for pagination verification.
        await page.getByLabel('Previous Quotes / Revisions (Updated)', { exact: true }).check();
        await idle();
        await page.evaluate(() => {
            const span = [...document.querySelectorAll('span')].find(n => /^SMA\/SXP\/1515-L1\/1504-R\d+$/.test(n.textContent.trim()));
            let card = span;
            while (card && !card.querySelector('svg.lucide-chevron-down')) card = card.parentElement;
            card?.querySelector('svg.lucide-chevron-down')?.parentElement.click();
        });
        const revision = page.getByText('SMA/SXP/1515-L1/1504-R4', { exact: true }).first();
        await revision.waitFor();
        const revisionStart = Date.now();
        await revision.click();
        await idle();
        await page.getByRole('button', { name: /^Align Page$/i }).waitFor({ timeout: 90000 });
        await expect(page.getByRole('button', { name: /^Align Page$/i })).toBeEnabled({ timeout: 90000 });
        report.savedRevisionReadyMs = Date.now() - revisionStart;
        report.align = [];
        for (let i = 0; i < 2; i++) {
            const at = Date.now();
            await page.getByRole('button', { name: /^Align Page$/i }).click();
            await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(n => /Aligning/i.test(n.textContent)), undefined, { timeout: 90000 });
            report.align.push({ ms: Date.now() - at, health: await measurePaginationHealth(page), pack: await page.locator('[data-ems-pack-ms]').first().evaluate(n => ({ ms: n.dataset.emsPackMs, cacheHit: n.dataset.emsPackCacheHit })).catch(() => null) });
            console.log('ALIGN_TIMING', report.align.at(-1).ms);
        }
        page.on('dialog', dialog => dialog.accept());
        const pdfAt = Date.now();
        const download = page.waitForEvent('download', { timeout: 180000 });
        await page.getByRole('button', { name: /Download quote PDF/i }).click();
        const file = await download;
        report.pdfDownloadMs = Date.now() - pdfAt;
        await file.saveAs(`${dir}/quote-1515-R4.pdf`);
        report.browser = await page.evaluate(() => ({ longTasks: window.__emsPerf.longTasks, resources: performance.getEntriesByType('resource').map(r => ({ name: new URL(r.name).pathname, duration: r.duration, transfer: r.transferSize, bytes: r.decodedBodySize })), navigation: performance.getEntriesByType('navigation').map(n => ({ domContentLoaded: n.domContentLoadedEventEnd, load: n.loadEventEnd })) }));
        expect(report.align.at(-1).health.overflows).toEqual([]);
        console.log('PERF_SUMMARY', JSON.stringify({ label, shell: report.shellReadyMs, initialData: report.initialDataReadyMs, revision: report.savedRevisionReadyMs, pdf: report.pdfDownloadMs, longTasks: report.browser.longTasks.length }));
    } finally {
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2));
        await page.screenshot({ path: `${dir}/last-screen.png` }).catch(() => {});
        await page.close();
    }
});
