import fs from 'node:fs';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
const source=JSON.parse(fs.readFileSync('e2e/artifacts/clause-mutations-1515/pricing-request.json','utf8'));
const window=new Window();window.document.write(source.html);
const content=window.document.querySelector('.quote-a4-sheet--continuation .content-section');assert.ok(content);
const probe=window.document.createElement('div');probe.dataset.emsPackSeg='999999';probe.style.cssText='position:absolute;top:2400px;height:100px';probe.textContent='PDF boundary regression probe';content.appendChild(probe);
const response=await fetch('http://127.0.0.1:5008/api/quote-pdf/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...source,html:'<!DOCTYPE html>'+window.document.documentElement.outerHTML})});
const result=await response.json();assert.equal(response.status,500);assert.match(result.message,/layout validation failed/);
fs.writeFileSync('e2e/artifacts/clause-mutations-1515/server-boundary-guard.json',JSON.stringify({status:response.status,blocked:true,message:result.message},null,2));console.log('Server refused overflowing PDF as expected.');
