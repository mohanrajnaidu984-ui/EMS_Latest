import fs from 'node:fs';import {Window} from 'happy-dom';const w=new Window();w.document.body.innerHTML=fs.readFileSync('e2e/artifacts/current-draft-1515/draft-before.txt','utf8');
for(const b of w.document.querySelectorAll('.quote-clause-block')){const title=b.querySelector('h3')?.textContent||'';if(!/Assumptions-|General Conditions/.test(title))continue;
 console.log(title);const table=b.querySelector('table');for(const r of [...table.rows].slice(0,2)){ console.log([...r.cells].map(c=>({text:c.textContent.trim().slice(0,140),len:c.textContent.length,children:[...c.children].map(x=>[x.tagName,x.textContent.length]),style:c.getAttribute('style')}))); }
 fs.writeFileSync('scratch/'+(/Assumptions/.test(title)?'assumptions-row':'general-row')+'.txt',table.outerHTML);
}
