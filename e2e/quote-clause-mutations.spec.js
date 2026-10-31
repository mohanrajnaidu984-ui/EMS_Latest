import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import { EMS_E2E_ADMIN, seedEmsAuthInBrowser, openEnquiryQuotePreview, clickAlignPage, measurePaginationHealth } from './helpers/emsSession.js';

test('1515 additions, removals and edited preceding content retain preview/PDF flow', async ({browser}) => {
    test.setTimeout(600000);
    const page = await browser.newPage({viewport:{width:1600,height:1500},acceptDownloads:true});
    page.setDefaultTimeout(15000);
    const dir=`e2e/artifacts/clause-mutations-1515${process.env.EMS_MUTATION_STRESS === '1' ? '-stress' : ''}`;fs.mkdirSync(dir,{recursive:true});
    const results=[];const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    // Exercise React/editor state without persisting any customer draft or quote.
    await page.route('**/api/quotes/**',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
    await page.addInitScript(seedEmsAuthInBrowser,EMS_E2E_ADMIN);
    const normalize=value=>value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
    let activeLabel='';
    page.on('request',request=>{
        if(request.url().endsWith('/api/quote-pdf/generate')&&request.postData())
            fs.writeFileSync(`${dir}/${activeLabel}-request.json`,request.postData());
    });
    const verify=async label=>{
        activeLabel=label;
        await clickAlignPage(page);
        const health=await measurePaginationHealth(page);
        expect(health.overflows).toEqual([]);expect(health.integrityBanner).toBe(false);
        const groups=()=>page.locator('#quote-preview .quote-a4-sheet--continuation').evaluateAll(sheets=>sheets.map(sheet=>[...new Set([...sheet.querySelectorAll('[data-ems-pack-seg]')].map(n=>n.dataset.emsPackSeg))]));
        const first=await groups();await clickAlignPage(page);expect(await groups()).toEqual(first);
        const preview=await page.locator('#quote-preview .quote-a4-sheet').evaluateAll(sheets=>sheets.map(sheet=>({
            blocks:[...sheet.querySelectorAll('.quote-clause-block')].map(block=>block.innerText),
            headings:[...sheet.querySelectorAll('.quote-clause-block')].filter(block=>block.querySelector('h3')).map(block=>({heading:block.querySelector('h3').textContent,body:block.querySelector('.clause-content')?.textContent.trim()||''})),
        })));
        fs.writeFileSync(`${dir}/${label}-live.txt`, await page.locator('#quote-print-root').evaluate(root=>root.outerHTML));
        if(process.env.EMS_TEST_PYTHON){const geometry=await page.locator('#quote-preview .quote-a4-sheet').evaluateAll(sheets=>sheets.map(sheet=>{const r=sheet.getBoundingClientRect();return [...sheet.querySelectorAll('[data-ems-pack-seg], .quote-clause-block h3')].map((n,index)=>{const b=n.getBoundingClientRect();return {id:n.dataset.emsPackSeg||`heading-${index}`,text:n.innerText||n.textContent||'',box:[(b.left-r.left)/r.width,(b.top-r.top)/r.height,(b.right-r.left)/r.width,(b.bottom-r.top)/r.height]};});}));fs.writeFileSync(`${dir}/${label}-geometry.json`,JSON.stringify(geometry));}
        fs.writeFileSync(`${dir}/${label}-live-metrics.json`, JSON.stringify(await page.locator('#quote-preview .quote-a4-sheet').evaluateAll(sheets=>sheets.map((sheet,index)=>{
            const content=sheet.querySelector('.content-section');const top=content?.getBoundingClientRect().top;
            return {page:index+1,units:[...sheet.querySelectorAll('[data-ems-pack-seg]')].map(unit=>({id:unit.dataset.emsPackSeg,top:unit.getBoundingClientRect().top-top,bottom:unit.getBoundingClientRect().bottom-top,text:unit.textContent.slice(0,100)}))};
        })),null,2));
        expect(preview.slice(1).every(sheet=>sheet.blocks.some(text=>text.trim()))).toBe(true);
        const assumptions=preview.flatMap(sheet=>sheet.headings).filter(block=>/Assumptions-/.test(block.heading));
        expect(assumptions.length).toBeGreaterThan(0);
        expect(assumptions.every(block=>block.body.includes('The quantities'))).toBe(true);
        const pending=Promise.race([
            page.waitForEvent('download',{timeout:180000}),
            page.waitForEvent('dialog',{timeout:180000}).then(dialog=>{throw new Error(dialog.message());}),
        ]);
        await page.getByRole('button',{name:/Download quote PDF/i}).click();
        const download=await pending;const pdfPath=`${dir}/${label}.pdf`;await download.saveAs(pdfPath);
        const {PDFParse}=await import('pdf-parse');const parser=new PDFParse({data:fs.readFileSync(pdfPath)});
        const pdf=await parser.getText();await parser.destroy();
        expect(pdf.total).toBe(preview.length);
        const parity=preview.map((sheet,index)=>{
            const text=normalize(pdf.pages[index]?.text||'');let cursor=0;
            const blocks=sheet.blocks.map(block=>{const at=text.indexOf(normalize(block),cursor);if(at>=0)cursor=at+normalize(block).length;return {matches:at>=0,preview:block};});
            return {page:index+1,blocks,matches:blocks.every(block=>block.matches)};
        });
        const record={label,pages:pdf.total,health,groups:first,preview,parity};results.push(record);
        fs.writeFileSync(`${dir}/results.json`,JSON.stringify({results,errors},null,2));
        console.log('VARIANT',JSON.stringify({label,pages:pdf.total,overflow:health.overflows.length,mismatches:parity.filter(p=>!p.matches).map(p=>p.page)}));
        expect(parity.filter(p=>!p.matches)).toEqual([]);
        if(process.env.EMS_TEST_PYTHON){execFileSync(process.env.EMS_TEST_PYTHON,['e2e/helpers/verifyQuotePdfGeometry.py',pdfPath,`${dir}/${label}-geometry.json`,`${dir}/${label}-geometry-validation.json`]);const geometry=JSON.parse(fs.readFileSync(`${dir}/${label}-geometry-validation.json`,'utf8'));expect(geometry.checks.filter(c=>!c.matches)).toEqual([]);}
        await page.screenshot({path:`${dir}/${label}.png`});
    };
    try {
        await page.goto('/',{waitUntil:'domcontentloaded'});await openEnquiryQuotePreview(page,'1515');
        await page.getByRole('checkbox',{name:/Pricing.*Payment/i}).check();
        await verify('pricing');
        // Add two paragraphs before assumptions, matching the extra preceding
        // height in the user's two-line pricing example without changing prices.
        await page.locator('#quote-preview .quote-clause-block').filter({has:page.locator('h3').filter({hasText:/Pricing.*Payment/})}).first().click();
        const editor=page.locator('.jodit-wysiwyg[contenteditable="true"]').last();await editor.waitFor();
        await editor.evaluate(node=>{node.innerHTML+='<p>Additional payment milestone for pagination regression.</p><p>Second payment milestone for pagination regression.</p>';node.dispatchEvent(new Event('input',{bubbles:true}));});
        await verify('additional-preceding-paragraphs');
        await page.getByRole('checkbox',{name:/Exclusions.*Qualifications/i}).check();
        await verify('additional-standard-clause');
        await page.getByRole('button',{name:'Add New Clause',exact:true}).click();
        await page.getByPlaceholder('Clause Heading (e.g., Special Conditions)').fill('Pagination regression clause');
        await page.getByRole('button',{name:'Add',exact:true}).click();
        const customEditor=page.locator('.jodit-wysiwyg[contenteditable="true"]').last();await customEditor.waitFor();
        await customEditor.evaluate((node,stress)=>{node.innerHTML='<p>'+('Additional custom clause text preserves sequential flow. '.repeat(stress?100:30))+'</p>'+('<p><br></p>'.repeat(stress?100:2));node.dispatchEvent(new Event('input',{bubbles:true}));},process.env.EMS_MUTATION_STRESS === '1');
        await verify('additional-custom-clause-with-blank-tail');
        await page.getByTitle('Remove Clause',{exact:true}).last().click();
        await page.getByRole('checkbox',{name:/Exclusions.*Qualifications/i}).uncheck();
        await page.getByRole('checkbox',{name:/Pricing.*Payment/i}).uncheck();
        await verify('clauses-removed');
        expect(await page.locator('#quote-preview').innerText()).not.toContain('Pagination regression clause');
        expect(errors).toEqual([]);
    } finally {
        fs.writeFileSync(`${dir}/results.json`,JSON.stringify({results,errors},null,2));
        await page.screenshot({path:`${dir}/last-screen.png`}).catch(()=>{});await page.close();
    }
});
