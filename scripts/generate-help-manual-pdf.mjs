/**
 * Generate the downloadable manual from the same content as the Help tab.
 * Usage: node scripts/generate-help-manual-pdf.mjs
 * Set EMS_MANUAL_BROWSER_CHANNEL to use an installed Chrome or Edge channel.
 */
import { chromium } from 'playwright';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const projectFile = (relativePath) => new URL(relativePath, new URL('../', import.meta.url));
const manualSource = projectFile('src/components/Help/manualPages.jsx');
const { code } = await transformWithEsbuild(await readFile(manualSource, 'utf8'), fileURLToPath(manualSource), {
  jsx: 'transform',
  format: 'esm',
});
// Resolve React before loading the compiled JSX from an in-memory module.
const moduleCode = code.replace(/(['"])react\1/, JSON.stringify(import.meta.resolve('react')));
const { manualIntro, manualPages } = await import('data:text/javascript;base64,' + Buffer.from(moduleCode).toString('base64'));

async function logoData(filename) {
  const data = await readFile(projectFile('src/assets/' + filename));
  return 'data:image/png;base64,' + data.toString('base64');
}

const [emsLogo, acgLogo] = await Promise.all([
  logoData('ems_logo_final.png'),
  logoData('almoayyed-logo.png'),
]);

const brand = `
  <div style="width:100%;display:flex;justify-content:space-between;align-items:center;gap:16px;padding-bottom:10px;border-bottom:1px solid #dce4ef;box-sizing:border-box">
    <img src="${emsLogo}" alt="EMS Enquiry Management System" style="width:auto;max-width:38%;height:37.5px;object-fit:contain">
    <img src="${acgLogo}" alt="Almoayyed Contracting Group" style="width:auto;max-width:45%;height:35px;object-fit:contain">
  </div>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>EMS User Manual</title>
<style>
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font: 10.5pt/1.42 "Segoe UI", Arial, sans-serif; color: #24354d; }
  h1, h2 { color: #20396d; font-weight: 700; break-after: avoid; }
  h1 { font-size: 27pt; letter-spacing: -.04em; line-height: 1.10; margin: 0 0 9pt; }
  h2 { font-size: 14pt; letter-spacing: -.015em; line-height: 1.25; margin: 19pt 0 9pt; padding-left: 7pt; border-left: 2pt solid #ed1364; }
  p { margin: 0 0 8pt; orphans: 2; widows: 2; }
  p:has(+ :is(ol, ul)) { margin-bottom: 4pt; break-after: avoid; }
  ol, ul { margin: 0 0 10pt; padding-left: 18pt; }
  li > :is(ol, ul) { margin: 3pt 0 5pt; }
  li { margin-bottom: 2pt; break-inside: avoid; }
  code { font-size: 9pt; background: #edf2f9; overflow-wrap: anywhere; }
  .intro { color: #52647e; margin-bottom: 14pt; }
  .web-brand { display: none; }
  @media print {
    main > section:last-child { break-before: page; }
  }
  @media screen {
    html { background: #eef2f7; }
    body { width: min(100%, 210mm); min-height: 100vh; margin: 0 auto; padding: 32px; background: #fff; }
    .web-brand { display: block; margin-bottom: 24px; }
  }
</style>
</head>
<body>
  <header class="web-brand">${brand}</header>
  <main>
    <h1>EMS User Manual</h1>
    <p class="intro">${manualIntro}</p>
    ${manualPages.map(({ title, content }) => `<section><h2>${title}</h2>${renderToStaticMarkup(content)}</section>`).join('\n')}
  </main>
</body>
</html>`;

const sideMargin = '18mm';
const headerTemplate = `<div style="width:100%;padding:0 ${sideMargin};box-sizing:border-box">${brand}</div>`;
const footerTemplate = `
  <div style="width:100%;box-sizing:border-box;padding:0 ${sideMargin};font:8pt/12pt 'Segoe UI',Arial,sans-serif;color:#52647e">
    <div style="border-top:1px solid #dce4ef;padding-top:7.5px;display:flex;justify-content:space-between">
      <span>EMS User Manual</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>
  </div>`;

const browserChannel = process.env.EMS_MANUAL_BROWSER_CHANNEL ||
  (existsSync(chromium.executablePath()) ? undefined : 'chrome');
const browser = await chromium.launch({ channel: browserChannel });
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    margin: { top: '30mm', bottom: '21.25mm', left: sideMargin, right: sideMargin },
    headerTemplate,
    footerTemplate,
    outline: true,
    tagged: true,
  });

  await mkdir(projectFile('docs/'), { recursive: true });
  const pdfPath = projectFile('docs/EMS-User-Manual.pdf');
  const htmlPath = projectFile('docs/EMS-User-Manual.html');
  await Promise.all([writeFile(pdfPath, pdf), writeFile(htmlPath, html)]);
  await Promise.all([
    copyFile(pdfPath, projectFile('public/EMS-User-Manual.pdf')),
    copyFile(htmlPath, projectFile('public/EMS-User-Manual.html')),
  ]);
  console.log(fileURLToPath(pdfPath));
} finally {
  await browser.close();
}
