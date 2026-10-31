import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {EMS_E2E_ADMIN,seedEmsAuthInBrowser,clickAlignPage,measurePaginationHealth} from './helpers/emsSession.js';

const inventory=JSON.parse(fs.readFileSync('e2e/artifacts/general-pagination/inventory.json','utf8'));
const chosen=(process.env.EMS_GENERAL_QUOTE_IDS||'4384,4388,4387,4381,4390,4382,4368,4370,4374,4377').split(',').map(Number);
for(const id of chosen){
    const quote=inventory.find(q=>q.ID===id);
    test(`saved quote ${id} enquiry ${quote.RequestNo} ${quote.OwnJob}`,async({browser})=>{
        test.setTimeout(240000);
        const landscape=process.env.EMS_GENERAL_LANDSCAPE==='1';
        const dir=`e2e/artifacts/general-pagination/quote-${id}${landscape?'-landscape':''}`;fs.mkdirSync(dir,{recursive:true});
        const report={id,requestNo:quote.RequestNo,quoteNumber:quote.QuoteNumber,division:quote.OwnJob,htmlChars:Number(quote.HtmlChars),errors:[],responses:[]};
        const page=await browser.newPage({viewport:{width:1600,height:1500},acceptDownloads:true});page.setDefaultTimeout(20000);
        await page.addInitScript(seedEmsAuthInBrowser,EMS_E2E_ADMIN);
        await page.route('**/api/quotes/**',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
        await page.route('**/e2e/quote-harness?*',route=>route.fulfill({contentType:'text/html',body:`<!DOCTYPE html><html><head><meta charset="UTF-8"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/@vite/client"></script></head><body style="margin:0"><div id="root"></div><script type="module" src="/e2e/harness/quoteHarness.jsx"></script></body></html>`}));
        page.on('pageerror',error=>{report.errors.push(error.message);console.log('PAGE_ERROR',error.message);});
        const alerts=[];page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.accept();});
        page.on('response',response=>{if(response.url().includes('/quote-pdf/generate'))report.responses.push(response.status());});
        page.on('request',request=>{if(request.url().endsWith('/api/quote-pdf/generate')&&request.postData())fs.writeFileSync(`${dir}/pdf-request.json`,request.postData());});
        try{
            const params=new URLSearchParams({requestNo:quote.RequestNo,quoteId:String(id),quoteNumber:quote.QuoteNumber});
            await page.goto(`/e2e/quote-harness?${params}`,{waitUntil:'domcontentloaded'});
            await page.locator('#quote-preview').waitFor({state:'visible',timeout:90000});
            await expect(page.locator('#quote-preview')).toContainText(quote.QuoteNumber,{timeout:90000});
            if(landscape){await clickAlignPage(page);await page.getByRole('textbox',{name:'Current page number',exact:true}).fill('2');await page.getByRole('textbox',{name:'Current page number',exact:true}).press('Enter');await page.getByRole('button',{name:'Set current page to landscape',exact:true}).click();await expect(page.locator('#quote-preview .quote-a4-sheet--landscape')).toHaveCount(1);}
            const groups=()=>page.locator('#quote-preview .quote-a4-sheet--continuation').evaluateAll(sheets=>sheets.map(sheet=>[...new Set([...sheet.querySelectorAll('[data-ems-pack-seg]')].map(n=>n.dataset.emsPackSeg))]));
            report.align=[];
            for(let i=0;i<2;i++){await clickAlignPage(page);report.align.push({health:await measurePaginationHealth(page),groups:await groups()});}
            expect(report.align[1].groups).toEqual(report.align[0].groups);
            expect(report.align[1].health.overflows).toEqual([]);expect(report.align[1].health.integrityBanner).toBe(false);
            const preview=await page.locator('#quote-preview .quote-a4-sheet').evaluateAll(sheets=>sheets.map(sheet=>[...sheet.querySelectorAll('.quote-clause-block')].map(n=>n.innerText)));
            report.preview=preview;expect(preview.slice(1).every(blocks=>blocks.some(text=>text.trim()))).toBe(true);
            const geometry=await page.locator('#quote-preview .quote-a4-sheet').evaluateAll(sheets=>sheets.map(sheet=>{const r=sheet.getBoundingClientRect();return [...sheet.querySelectorAll('[data-ems-pack-seg], .quote-clause-block h3')].map((node,index)=>{const b=node.getBoundingClientRect();return {id:node.dataset.emsPackSeg||`heading-${index}`,text:node.innerText||node.textContent||'',box:[(b.left-r.left)/r.width,(b.top-r.top)/r.height,(b.right-r.left)/r.width,(b.bottom-r.top)/r.height]};});}));
            fs.writeFileSync(`${dir}/geometry.json`,JSON.stringify(geometry));
            const inspect=()=>[...document.querySelectorAll('.quote-a4-sheet--continuation')].map(sheet=>[...sheet.querySelectorAll('.quote-clause-block, .quote-clause-block *')].map(n=>{const s=getComputedStyle(n);return {tag:n.tagName,cls:n.className,text:n.textContent.slice(0,50),top:n.getBoundingClientRect().top-sheet.getBoundingClientRect().top,height:n.getBoundingClientRect().height,css:Object.fromEntries(['display','font-size','line-height','margin-top','margin-bottom','padding-top','padding-bottom','box-sizing','height','min-height','list-style-position'].map(k=>[k,s.getPropertyValue(k)]))};}));
            fs.writeFileSync(`${dir}/live-layout.json`,JSON.stringify(await page.evaluate(inspect),null,2));
            fs.writeFileSync(`${dir}/preview.txt`,await page.locator('#quote-print-root').evaluate(root=>root.outerHTML));
            const downloadPromise=Promise.race([page.waitForEvent('download',{timeout:120000}),page.waitForEvent('dialog',{timeout:120000}).then(dialog=>{throw new Error(dialog.message());})]);
            await page.getByRole('button',{name:/Download quote PDF/i}).click();
            const download=await downloadPromise;await download.saveAs(`${dir}/quote.pdf`);
            const exportPage=await browser.newPage();await exportPage.setContent(JSON.parse(fs.readFileSync(`${dir}/pdf-request.json`,'utf8')).html);await exportPage.evaluate(()=>document.fonts.ready);fs.writeFileSync(`${dir}/export-layout.json`,JSON.stringify(await exportPage.evaluate(inspect),null,2));await exportPage.close();
            const {PDFParse}=await import('pdf-parse');const parser=new PDFParse({data:fs.readFileSync(`${dir}/quote.pdf`)});const pdf=await parser.getText();await parser.destroy();
            report.previewPages=preview.length;report.pdfPages=pdf.total;
            const normalize=text=>text.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
            report.parity=preview.map((blocks,index)=>{const text=normalize(pdf.pages[index]?.text||'');let cursor=0;const checks=blocks.map(block=>{const needle=normalize(block);const at=text.indexOf(needle,cursor);if(at>=0)cursor=at+needle.length;return {matches:at>=0,preview:block};});return {page:index+1,matches:checks.every(b=>b.matches),blocks:checks,pdf:pdf.pages[index]?.text};});
            expect(report.pdfPages).toBe(report.previewPages);
            execFileSync(process.env.EMS_TEST_PYTHON||'python',['e2e/helpers/verifyQuotePdfGeometry.py',`${dir}/quote.pdf`,`${dir}/geometry.json`,`${dir}/geometry-validation.json`]);
            report.geometry=JSON.parse(fs.readFileSync(`${dir}/geometry-validation.json`,'utf8'));
            expect(report.geometry.checks.filter(c=>!c.matches)).toEqual([]);
            expect(report.errors).toEqual([]);expect(alerts).toEqual([]);report.passed=true;
        }finally{
            report.alerts=alerts;fs.writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));
            await page.screenshot({path:`${dir}/last-screen.png`}).catch(()=>{});await page.close();
            console.log('GENERAL_QUOTE',JSON.stringify({id,requestNo:quote.RequestNo,division:quote.OwnJob,passed:!!report.passed,preview:report.previewPages,pdf:report.pdfPages,errors:report.errors,alerts}));
        }
    });
}
