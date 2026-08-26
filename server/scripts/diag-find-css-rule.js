const fs = require('fs');
const path = require('path');
const dir = path.join(process.env.TEMP || require('os').tmpdir(), 'ems-quote-pdf');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && !f.startsWith('diag'));
files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
const html = fs.readFileSync(path.join(dir, files[0]), 'utf8');
const idx = html.indexOf('Highest-specificity sheet pin');
console.log('found at', idx);
console.log(html.slice(idx, idx + 800));
