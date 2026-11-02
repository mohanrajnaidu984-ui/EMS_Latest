// Creates one clearly-labelled unsent test draft from the real EMS browser origin.
// No customer data, recipients, API writes or message-send operation.
const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
 const dir='e2e/artifacts/outlook-production';fs.mkdirSync(dir,{recursive:true});
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.setContent('<h1>EMS Outlook connection test</h1><p>Validation attachment only. No quotation or customer data.</p>');
  const pdf=await page.pdf({format:'A4'});fs.writeFileSync(`${dir}/connection-test.pdf`,pdf);
  const payload={to:'',cc:'',bcc:'',subject:'EMS Outlook connection test - DO NOT SEND - 20261031',body:'Connection test only. This unsent draft contains no customer data and may be discarded.',attachmentName:'EMS_Connection_Test.pdf',pdfBase64:pdf.toString('base64'),extraAttachments:[{filename:'EMS_Connection_Test.txt',base64:Buffer.from('EMS extra attachment validation. No customer data.').toString('base64')}]};
  await page.goto('http://151.50.1.38/',{waitUntil:'domcontentloaded',timeout:20000});
  const report=await page.evaluate(async payload=>{
   try {const response=await fetch('http://127.0.0.1:39281/outlook-draft',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify(payload)});return {origin:location.origin,status:response.status,result:await response.json()};}
   catch(error){return {origin:location.origin,error:error.message};}
  },payload);
  fs.writeFileSync(`${dir}/live-origin-test.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  if(report.status!==200)process.exitCode=1;
 } finally {await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
