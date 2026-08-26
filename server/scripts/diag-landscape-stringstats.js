const fs = require('fs');

// Latest run (from terminal 4 logs):
// navigationUrl: file:///C:/Users/MOHAN~1.NAI/AppData/Local/Temp/ems-quote-pdf/ems-quote-pdf-1787206866940-5652-7b3hocbr.html
const path =
    'C:/Users/MOHAN~1.NAI/AppData/Local/Temp/ems-quote-pdf/ems-quote-pdf-1787206866940-5652-7b3hocbr.html';

const html = fs.readFileSync(path, 'utf8');
const idx = html.indexOf('data-page-orientation="landscape"');
console.log('idx', idx, 'len', html.length);

const chunk1 = html.slice(idx, idx + 200000);
console.log('210mm count in chunk1', (chunk1.match(/210mm/g) || []).length);
console.log('297mm count in chunk1', (chunk1.match(/297mm/g) || []).length);
console.log('max-width:210mm', (chunk1.match(/max-width:\\s*210mm/g) || []).length);
console.log('width:210mm', (chunk1.match(/width:\\s*210mm/g) || []).length);

const end = html.indexOf('data-page-orientation="portrait"', idx + 1);
const chunk = end > idx ? html.slice(idx, end) : chunk1;
console.log('chunk chars', chunk.length);
console.log('210mm in chunk', (chunk.match(/210mm/g) || []).length);
console.log('297mm in chunk', (chunk.match(/297mm/g) || []).length);

const samples = [...chunk.matchAll(/[^"'`]{0,90}210mm[^"'`]{0,90}/g)]
    .slice(0, 8)
    .map((m) => m[0]);
console.log('samples:', samples.join('\n---\n'));

