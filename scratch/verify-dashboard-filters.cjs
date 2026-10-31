const fs=require('fs');const path=require('path');const Module=require('module');const assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
require(path.join(root,'server/node_modules/dotenv')).config({path:path.join(root,'server/.env'),quiet:true});
const filename=path.join(root,'server/routes/dashboard.js');
function load(source){const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(source+'\nmodule.exports = {runDashboardCalendarMonthQuery};',filename);return mod.exports;}
const before=load(fs.readFileSync(path.join(root,'scratch/performance-baseline-20261030/dashboard.js'),'utf8'));
const after=load(fs.readFileSync(filename,'utf8'));
const db=require(path.join(root,'server/dbConfig.js'));
function clean(value){if(Array.isArray(value))return value.map(clean).sort((a,b)=>String(a.Date).localeCompare(String(b.Date)));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='_sqlTotals').map(([k,v])=>[k,clean(v)]));return value;}
(async()=>{await db.connectDB();const results=[];try{
 for(const {month,year,division} of [{month:12,year:2025,division:'All'},{month:1,year:2026,division:'Simplex Project'},{month:10,year:2026,division:'Simplex Project'}]){
 const query={userEmail:'ems_admin@almoayyedcg.com',userRole:'Admin',userName:'Admin',division,salesEngineer:'All',today:'2026-10-30'};
 const a=await before.runDashboardCalendarMonthQuery(query,month,year);const b=await after.runDashboardCalendarMonthQuery(query,month,year);
 assert.deepEqual(clean(b),clean(a));results.push({month,year,division,identical:true,days:b.daily.length});
 }
 fs.writeFileSync(path.join(root,'scratch/dashboard-filter-parity.json'),JSON.stringify(results,null,2));console.log(results);
 }finally{await db.disconnectDB();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
