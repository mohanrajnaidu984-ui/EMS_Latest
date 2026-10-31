import fs from 'node:fs';
const query = new URLSearchParams({ userEmail: 'ems_admin@almoayyedcg.com', userRole: 'Admin', userName: 'Admin', division: 'All', salesEngineer: 'All', today: '2026-10-30' });
const paths = ['calendar?month=10&year=2026&', 'calendars-history?anchorMonth=10&anchorYear=2026&'];
const result = [];
for (const path of paths) {
 const at = performance.now(); const response = await fetch('http://127.0.0.1:5008/api/dashboard/' + path + query);
 result.push({ path, status: response.status, ms: performance.now()-at, body: await response.json() });
}
fs.writeFileSync('scratch/dashboard-before.json', JSON.stringify(result,null,2));
console.log(result.map(({body,...rest})=>rest));
