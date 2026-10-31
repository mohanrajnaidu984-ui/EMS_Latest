import fs from 'node:fs';
import assert from 'node:assert/strict';
const before=JSON.parse(fs.readFileSync('scratch/dashboard-before.json','utf8'));
const query=new URLSearchParams({userEmail:'ems_admin@almoayyedcg.com',userRole:'Admin',userName:'Admin',division:'All',salesEngineer:'All',today:'2026-10-30'});
const clean=value=>{
 if(Array.isArray(value))return value.map(clean).sort((a,b)=>String(a?.Date||a?.year+'-'+a?.month).localeCompare(String(b?.Date||b?.year+'-'+b?.month)));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='_sqlTotals').map(([k,v])=>[k,clean(v)]));
 return value;
};
const after=[];
for(const item of before){
 const at=performance.now();const r=await fetch('http://127.0.0.1:5008/api/dashboard/'+item.path+query);
 const body=await r.json(); assert.equal(r.status,200);assert.deepEqual(clean(body),clean(item.body));
 after.push({path:item.path,beforeMs:item.ms,afterMs:performance.now()-at,identicalCounts:true,body});
}
const at=performance.now();const users=await fetch('http://127.0.0.1:5008/api/users?summary=1');const text=await users.text();
after.push({path:'/api/users?summary=1',status:users.status,ms:performance.now()-at,bytes:Buffer.byteLength(text),count:JSON.parse(text).length});
fs.writeFileSync('scratch/dashboard-after.json',JSON.stringify(after,null,2));console.log(after.map(({body,...rest})=>rest));
