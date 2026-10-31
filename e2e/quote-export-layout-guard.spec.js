import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { EMS_E2E_ADMIN, seedEmsAuthInBrowser, openEnquiryQuotePreview, clickAlignPage } from './helpers/emsSession.js';

test('PDF layout failure cannot silently produce an unverified raster download', async ({browser}) => {
    test.setTimeout(180000);
    const page=await browser.newPage({viewport:{width:1600,height:1500},acceptDownloads:true});
    const alerts=[];const downloads=[];
    page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.accept();});
    page.on('download',download=>downloads.push(download.suggestedFilename()));
    await page.route('**/api/quotes/**',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
    await page.addInitScript(seedEmsAuthInBrowser,EMS_E2E_ADMIN);
    try {
        await page.goto('/',{waitUntil:'domcontentloaded'});await openEnquiryQuotePreview(page,'1515');await clickAlignPage(page);
        await page.route('**/api/quote-pdf/generate',route=>route.fulfill({
            status:500,contentType:'application/json',body:JSON.stringify({error:'pdf_layout_invalid',
                message:'Quote PDF layout validation failed: content exceeds its page boundary. Re-align the quotation before downloading.'}),
        }));
        await page.getByRole('button',{name:/Download quote PDF/i}).click();
        await expect.poll(()=>alerts.some(message=>/PDF layout validation failed/i.test(message)),{timeout:15000}).toBe(true);
        await page.waitForTimeout(2000);expect(downloads).toEqual([]);
        fs.mkdirSync('e2e/artifacts/clause-mutations-1515',{recursive:true});
        fs.writeFileSync('e2e/artifacts/clause-mutations-1515/client-fallback-guard.json',JSON.stringify({blocked:true,alerts,downloads},null,2));
    } finally {await page.close();}
});
