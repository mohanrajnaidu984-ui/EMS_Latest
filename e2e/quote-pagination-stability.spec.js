import { test, expect } from '@playwright/test';
import { EMS_E2E_ADMIN, seedEmsAuthInBrowser, openEnquiryQuotePreview } from './helpers/emsSession.js';
test('quote packing settles through rerenders without maximum update depth errors', async ({ page }) => {
    test.setTimeout(180000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/maximum update depth/i.test(message.text())) errors.push(message.text()); });
    await page.route('**/api/quotes/**', route => ['GET','HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    await page.addInitScript(seedEmsAuthInBrowser, EMS_E2E_ADMIN);
    await page.goto('/'); await openEnquiryQuotePreview(page, '1515');
    const preview = page.locator('#quote-print-root #quote-preview'); await expect(preview).toBeVisible();
    await page.waitForTimeout(1500);
    for (let i = 0; i < 4; i++) {
        await page.setViewportSize({ width: 1400 + i * 20, height: 1000 });
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        await expect(preview).toBeVisible();
    }
    await page.waitForTimeout(2000);
    await expect(page.locator('#quote-preview .quote-a4-sheet').first()).toBeVisible();
    expect(errors.filter(text => /maximum update depth|too many re-renders/i.test(text))).toEqual([]);
    expect(await page.evaluate(() => document.querySelector('#quote-preview') !== null)).toBe(true);
});
