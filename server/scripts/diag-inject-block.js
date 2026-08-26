const fs = require('fs');
const path = require('path');
const dir = path.join(process.env.TEMP || require('os').tmpdir(), 'ems-quote-pdf');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && !f.startsWith('diag'));
files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
const html = fs.readFileSync(path.join(dir, files[0]), 'utf8');
const start = html.indexOf('id="ems-pdf-sharp-text"');
console.log(html.slice(start, start + 12000));
