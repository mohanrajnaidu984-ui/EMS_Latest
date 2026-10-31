import fs from 'node:fs'; import {Window} from 'happy-dom';
const window=new Window();window.document.body.innerHTML=fs.readFileSync('e2e/artifacts/current-draft-1515/draft-before.txt','utf8');
for(const [i,p] of [...window.document.querySelectorAll('.quote-a4-sheet')].entries()){
 console.log('PAGE',i+1,[...p.querySelectorAll('.quote-clause-heading-panel')].map(x=>x.textContent));
 for(const b of p.querySelectorAll('.quote-clause-block'))if(/Assumptions-|General Conditions/.test(b.textContent))console.log(b.outerHTML.slice(0,2300));
}
