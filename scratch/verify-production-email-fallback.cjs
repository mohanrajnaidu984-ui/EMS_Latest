// Tests the corrected frontend function against the live, draft-only IIS API.
const {chromium}=require('playwright');
const {buildSync}=require('esbuild');
const fs=require('node:fs');
(async()=>{
 const dir='e2e/artifacts/outlook-production';
 const script=buildSync({entryPoints:['src/utils/quoteOutlookDraft.js'],bundle:true,write:false,format:'iife',globalName:'emsDraftTest',define:{'import.meta.env':'{}'}}).outputFiles[0].text;
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({acceptDownloads:true});const requests=[];
  page.on('request',r=>{if(/outlook-draft|email-draft/.test(r.url()))requests.push({url:r.url(),method:r.method()});});
  await page.goto('http://151.50.1.38/',{waitUntil:'domcontentloaded',timeout:20000});await page.addScriptTag({content:script});
  const pending=page.waitForEvent('download');
  const result=await page.evaluate(async pdf=>emsDraftTest.openQuoteOutlookDraft({
   apiBase:'',pdfBlob:new Blob([Uint8Array.from(atob(pdf),c=>c.charCodeAt(0))],{type:'application/pdf'}),displayFileName:'EMS_Connection_Test.pdf',
   emailFields:{userEmail:'ems-validation@example.invalid',to:'',cc:'',bcc:'',subject:'EMS IIS draft validation - DO NOT SEND',body:'Unsent test only. No customer data.',extraAttachments:[{filename:'EMS_Connection_Test.txt',base64:btoa('Attachment validation only.')}]},
   blobToBase64:blob=>new Promise(resolve=>{const reader=new FileReader();reader.onloadend=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);}),
   triggerBlobDownload:(blob,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();},
  }),fs.readFileSync(`${dir}/connection-test.pdf`).toString('base64'));
  const download=await pending;await download.saveAs(`${dir}/browser-fallback.eml`);
  const report={origin:await page.evaluate(()=>location.origin),result,requests,fileName:download.suggestedFilename()};
  fs.writeFileSync(`${dir}/browser-fallback-validation.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  if(result.method!=='eml-download'||requests.length!==1||!requests[0].url.endsWith('/api/quotes/email-draft'))process.exitCode=1;
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
