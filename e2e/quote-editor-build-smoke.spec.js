import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {EMS_E2E_ADMIN,seedEmsAuthInBrowser,openEnquiryQuotePreview} from './helpers/emsSession.js';
test('full production QuoteForm opens real clause editor and undoes table paste',async({page})=>{
 test.setTimeout(180000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='warning'||m.type()==='error')console.log('EDITOR_DIAGNOSTIC',m.text().slice(0,600));});
 await page.addInitScript(seedEmsAuthInBrowser,EMS_E2E_ADMIN);
 await page.route('**/api/quotes/**',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
 await page.goto('/');await openEnquiryQuotePreview(page,'1515');
 await page.locator('#quote-preview .quote-clause-block').first().click();
 const editor=page.locator('.jodit-wysiwyg[contenteditable="true"]').last();await editor.waitFor();
 await editor.click();await page.keyboard.press('Control+End');
 const countBefore=await editor.locator('table').count();
 fs.writeFileSync('e2e/artifacts/editor-production/real-before.html',await editor.innerHTML());
 await editor.evaluate(root=>{root.focus();const range=document.createRange();range.selectNodeContents(root);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);const dt=new DataTransfer();dt.setData('text/html','<table style="width:450px;border-collapse:collapse"><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody><tr><td>EMS editor regression only</td><td>12.340</td></tr></tbody></table>');dt.setData('text/plain','Item\tAmount\nEMS editor regression only\t12.340');root.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));});
 await page.waitForTimeout(1500);fs.writeFileSync('e2e/artifacts/editor-production/real-after.html',await editor.innerHTML());console.log('EDITOR_PAGE_ERRORS',JSON.stringify(errors));
 await expect(editor).toContainText('EMS editor regression only');await page.waitForTimeout(1200);
 const cell = editor.locator('td').filter({ hasText: /^EMS editor regression only$/ });
 await cell.click();
 await page.keyboard.press('Home');
 await page.keyboard.press('Shift+End');
 const bold = page.locator('#ems-quote-preview-toolbar [data-ref="bold"] button').first();
 const cellWeight = () => cell.evaluate(element => {
     const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
     let text;
     while ((text = walker.nextNode())) {
         if (text.textContent.includes('EMS editor regression only')) return Number(getComputedStyle(text.parentElement).fontWeight);
     }
     return 0;
 });
 await bold.click();
 await expect.poll(cellWeight).toBeGreaterThanOrEqual(600);
 await page.keyboard.press('Control+z');
 await expect.poll(cellWeight).toBeLessThan(600);
 await cell.click();
 await page.keyboard.press('Home');
 await page.keyboard.press('Shift+End');
 await page.locator('#ems-quote-preview-toolbar [data-ref="ul"] .jodit-toolbar-button__trigger').click();
 await page.locator('.jodit-popup:visible').last().getByText('Tick').click();
 await expect(cell.locator('ul.ems-bullet-check')).toHaveCount(1);
 await page.keyboard.press('Control+z');
 await expect(cell.locator('ul')).toHaveCount(0);
 await page.keyboard.press('Control+z');
 await expect(editor).not.toContainText('EMS editor regression only');expect(await editor.locator('table').count()).toBe(countBefore);
 await editor.evaluate(root=>{root.focus();const r=document.createRange();r.selectNodeContents(root);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);const dt=new DataTransfer();dt.setData('text/html','<table><tbody><tr><td>EMS headerless table regression</td><td>12.340</td></tr></tbody></table>');dt.setData('text/plain','EMS headerless table regression\t12.340');root.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));});
 await expect(editor).toContainText('EMS headerless table regression');await page.waitForTimeout(1200);
 await page.keyboard.press('Control+z');await expect(editor).not.toContainText('EMS headerless table regression');expect(await editor.locator('table').count()).toBe(countBefore);
 expect(errors).toEqual([]);
});
