const fs = require('fs');
const path = require('path');
const dir = path.join(process.env.TEMP || require('os').tmpdir(), 'ems-quote-pdf');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && !f.startsWith('diag'));
files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
const html = fs.readFileSync(path.join(dir, files[0]), 'utf8');
for (const marker of [
    'ems-pdf-sharp-text',
    'Highest-specificity sheet pin',
    'portrait default; landscape overrides',
    'PDF_FINAL',
    '</head>',
]) {
    console.log(marker, html.indexOf(marker));
}
