/**
 * Build production frontend (Vite) and package for IIS static deploy.
 * Output: EMS_Frontend_Deploy_YYYY-MM-DD/
 *
 * Usage: node build_frontend_deploy.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = __dirname;
const dateStamp = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.join(PROJECT_ROOT, `EMS_Frontend_Deploy_${dateStamp}`);
const FRONTEND_DIR = path.join(OUT_DIR, 'frontend');
const FRONTEND_DIST_DIR = path.join(FRONTEND_DIR, 'dist');
const DIST_SRC = path.join(PROJECT_ROOT, 'dist');

/** Minified production bundle still contains these strings when the fix is present. */
const MARKERS = ['data-ems-html2pdf', 'min-height: 297mm', 'grid-template-rows: auto minmax(0, 1fr) auto', 'justify-content: flex-end'];

console.log('Building production frontend (npm run build)...');
execSync('npm run build', {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
});

if (!fs.existsSync(DIST_SRC)) {
    console.error('dist/ not found after build.');
    process.exit(1);
}

const mainJs = fs.readdirSync(path.join(DIST_SRC, 'assets')).find((f) => /^index-.*\.js$/.test(f));
if (!mainJs) {
    console.error('No index-*.js in dist/assets');
    process.exit(1);
}
const mainPath = path.join(DIST_SRC, 'assets', mainJs);
const bundle = fs.readFileSync(mainPath, 'utf8');
const missing = MARKERS.filter((m) => !bundle.includes(m));
if (missing.length) {
    console.warn('Warning: bundle may be missing html2pdf fix markers:', missing.join(', '));
} else {
    console.log('Verified html2pdf PDF fix in', mainJs);
}

if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(FRONTEND_DIR, { recursive: true });
fs.mkdirSync(FRONTEND_DIST_DIR, { recursive: true });

fs.cpSync(DIST_SRC, FRONTEND_DIR, { recursive: true });
fs.cpSync(DIST_SRC, FRONTEND_DIST_DIR, { recursive: true });

for (const name of ['web.config', 'proxy-server.cjs']) {
    const fromPublic = path.join(PROJECT_ROOT, 'public', name);
    const fromRoot = path.join(PROJECT_ROOT, name);
    const src = fs.existsSync(fromPublic) ? fromPublic : fs.existsSync(fromRoot) ? fromRoot : null;
    if (src) {
        fs.copyFileSync(src, path.join(FRONTEND_DIR, name));
        fs.copyFileSync(src, path.join(FRONTEND_DIST_DIR, name));
    }
}

const readme = `# EMS Frontend IIS deploy package (${dateStamp})

This folder is **compiled static assets only** (no React source). It includes the **html2pdf blank-page PDF fix**.

## Copy to production server

Replace the site static root (keep a backup first):

\`\`\`
Source:  EMS_Frontend_Deploy_${dateStamp}\\frontend\\
Target:  C:\\inetpub\\wwwroot\\EMS\\frontend\\
\`\`\`

### Files to copy

- \`index.html\`
- \`assets\\\` (entire folder — **new** main bundle: \`${mainJs}\`)
- \`web.config\` (only if your server does not have custom IIS rules)
- \`proxy-server.cjs\` (optional; only if you use Node proxy instead of IIS rewrite)

### Do NOT delete on server unless you have backups

- Custom \`web.config\` edits
- Any extra static files you added under \`frontend\\\`

## After copy

1. Hard refresh browsers: **Ctrl+F5** (or clear cache).
2. Confirm new JS loaded: DevTools → Network → \`assets/${mainJs}\` (not an older \`index-*.js\`).
3. Test **Quote → Download PDF**.

## PDF generation note

- With \`VITE_QUOTE_PDF_BROWSER_DOWNLOAD=0\` (default in .env.production), Download PDF uses **server Puppeteer** first.
- To force **client html2pdf** (this fix) on every download, rebuild with \`VITE_QUOTE_PDF_BROWSER_DOWNLOAD=1\` in \`.env.production\`.

## Full app rebuild (dev machine)

Source + build scripts live in the EMS repo (parent of this package):

\`\`\`
cd <EMS repo>
npm install
npm run build
node build_frontend_deploy.cjs
\`\`\`

Built: ${new Date().toISOString()}
Main bundle: assets/${mainJs}
`;

fs.writeFileSync(path.join(OUT_DIR, 'FRONTEND_DEPLOY_README.md'), readme, 'utf8');
fs.writeFileSync(path.join(FRONTEND_DIR, 'BUILD_INFO.txt'), `EMS frontend build ${dateStamp}\nBundle: ${mainJs}\nhtml2pdf fix: yes\n`, 'utf8');

console.log('\n✅ Frontend deploy package ready:');
console.log('   ', OUT_DIR);
console.log('   Main bundle:', mainJs);
console.log('   Copy frontend\\* to C:\\inetpub\\wwwroot\\EMS\\frontend\\\n');
