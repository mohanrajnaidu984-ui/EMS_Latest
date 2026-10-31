/**
 * Fast diagnostic: open 1515, Align once, dump peel debug + overflow counts.
 */
import { test, expect } from '@playwright/test';
import {
    EMS_E2E_ADMIN,
    seedEmsAuthInBrowser,
    openEnquiryQuotePreview,
    clickAlignPage,
    measurePaginationHealth,
} from './helpers/emsSession.js';

test('peel debug 1515', async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.addInitScript(seedEmsAuthInBrowser, EMS_E2E_ADMIN);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await openEnquiryQuotePreview(page, '1515');
    await clickAlignPage(page);
    await page.waitForTimeout(8000);
    const debug = await page.evaluate(() => {
        const root = document.getElementById('quote-preview');
        return {
            peelDebug: root?.getAttribute('data-ems-peel-debug'),
            banner: /pagination (integrity|error)|clipped or missing/i.test(
                document.body.innerText || ''
            ),
        };
    });
    const health = await measurePaginationHealth(page);
    console.log('PEEL_DEBUG', debug);
    console.log(
        'HEALTH',
        JSON.stringify(
            {
                overflows: health.overflows.length,
                sheets: health.totalSheets,
                sparse: health.sparseSheets,
                sheetMeta: health.sheetMeta?.map((m) => ({
                    s: m.sheet,
                    n: m.stamped,
                    bottom: m.lastBottomPx,
                    limit: m.limitPx,
                })),
            },
            null,
            2
        )
    );
    expect(health.totalSheets).toBeGreaterThan(1);
    await page.close();
});
