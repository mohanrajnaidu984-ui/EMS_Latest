import fs from 'node:fs';import {chromium} from '@playwright/test';
const dir=process.argv[2]||'e2e/artifacts/current-draft-pricing-1515';
const req=JSON.parse(fs.readFileSync(dir+'/pdf-request.json','utf8'));
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1200,height:1700}});
await page.setContent(req.html,{waitUntil:'load',timeout:45000});await page.evaluate(()=>document.fonts.ready);
const metrics=await page.evaluate(()=>[...document.querySelectorAll('#quote-preview .quote-a4-sheet')].map((sheet,i)=>{
 const content=sheet.querySelector('.content-section');const top=content?.getBoundingClientRect().top;
 return {page:i+1,contentHeight:content?.getBoundingClientRect().height,headings:[...sheet.querySelectorAll('h3')].map(x=>x.textContent),rows:[...sheet.querySelectorAll('tr')].filter(r=>r.cells[0]?.textContent.trim()==='5.01').map(row=>({bottom:row.getBoundingClientRect().bottom-top,html:row.outerHTML,cells:[...row.cells].map(cell=>{
 const style=getComputedStyle(cell);const range=document.createRange();range.selectNodeContents(cell);
 return {height:cell.getBoundingClientRect().height,width:cell.getBoundingClientRect().width,text:cell.innerText,textBottom:range.getBoundingClientRect().bottom-top,style:Object.fromEntries(['font','lineHeight','padding','overflow','height','minHeight','maxHeight','verticalAlign'].map(k=>[k,style[k]]))};})}))};
}));fs.writeFileSync(dir+'/export-layout.json',JSON.stringify(metrics,null,2));console.log(metrics.filter(x=>x.rows.length));await page.screenshot({path:dir+'/export-layout.png',fullPage:true});await browser.close();
