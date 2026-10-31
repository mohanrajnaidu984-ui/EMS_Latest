import fs from 'node:fs';
const body=fs.readFileSync('e2e/artifacts/independent-investigation/pdf-request.json','utf8');
const results=[];
for(let i=0;i<2;i++){
 const at=performance.now();const r=await fetch('http://127.0.0.1:5008/api/quote-pdf/generate',{method:'POST',headers:{'Content-Type':'application/json'},body});
 const bytes=await r.arrayBuffer();results.push({status:r.status,ms:performance.now()-at,bytes:bytes.byteLength,timing:r.headers.get('x-ems-pdf-timing')});
}
fs.writeFileSync('scratch/pdf-performance-repeat.json',JSON.stringify(results,null,2));console.log(results);
