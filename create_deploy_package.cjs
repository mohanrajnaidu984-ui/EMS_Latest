/**
 * Build IIS deployment folder EMS_Deploy_YYYY-MM-DD (same layout as EMS_Deploy_2026-06-03).
 * Includes quote PDF (Puppeteer), Outlook/email draft routes, and local helper script.
 *
 * Usage: node create_deploy_package.cjs [--skip-uploads] [--with-node-modules]
 *        (production: no node_modules in zip — npm ci on server with Node 22 LTS)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = __dirname;
const skipNpmInstall = process.argv.includes('--skip-npm-install');
const skipUploads = process.argv.includes('--skip-uploads');
/** Pre-install node_modules on build machine (smoke test only — production must run npm ci on server). */
const withNodeModules = process.argv.includes('--with-node-modules');
const BASELINE_VERSION = '2026-07-12-latest';
const PDF_CSS_VERSION = '2026-06-05-footer-auto';
const FRONTEND_BUNDLE_MARKERS = [
    'data-ems-html2pdf',
    'margin-top: auto !important',
    'grid-template-rows: auto minmax(0, 1fr) auto !important',
    '_${Date.now()}.pdf',
];
const dateStamp = new Date().toISOString().slice(0, 10);
const DEPLOY_DIR = path.join(PROJECT_ROOT, `EMS_Deploy_${dateStamp}`);
const FRONTEND_DIR = path.join(DEPLOY_DIR, 'frontend');
const FRONTEND_DIST_DIR = path.join(FRONTEND_DIR, 'dist');
const BACKEND_DIR = path.join(DEPLOY_DIR, 'backend');
const HELPERS_DIR = path.join(DEPLOY_DIR, 'helpers');

/** Files that must exist in backend for PDF + email draft features. */
const REQUIRED_BACKEND_PATHS = [
    'index.js',
    'routes/quotePdf.js',
    'routes/quotes.js',
    'routes/enquiryOutlook.js',
    'lib/outlookDraftVbs.js',
    'lib/runOutlookHtmlDraftVbs.js',
    'lib/quoteSmtpDraft.js',
    'lib/quoteOutlookEmailFields.js',
    'lib/restrictQuotePdf.js',
    'lib/resolvePuppeteerChrome.js',
    'lib/quotePdfBrowserPool.cjs',
    'lib/quotePdfPerf.cjs',
    'lib/quotePrintExportCss.cjs',
    'lib/quotePrintSheetValidation.cjs',
    'lib/quotePdfPaginationDebug.cjs',
    'lib/attachmentsRoot.js',
    'scripts/probe-attachment-storage.cjs',
    'lib/enquiryNotifySmtp.js',
    'lib/enquiryNotifyEmailHtml.js',
    'lib/enquiryOutlookEmailFields.js',
    'lib/enquiryCustomerAckEmailHtml.js',
    'lib/enquiryCustomerAckData.js',
    'lib/loadEnquiryEmailRow.js',
    'lib/buildQuoteListSearchExtraWhere.js',
    'lib/siteVisitReminder.js',
    'lib/siteVisitReminderScheduler.js',
    'emailService.js',
    '.puppeteerrc.cjs',
];

function shouldCopyBackendEntry(src) {
    const rel = path.relative(path.join(PROJECT_ROOT, 'server'), src);
    const basename = path.basename(src);
    if (!rel || rel.startsWith('..')) return false;
    if (basename === 'node_modules' || rel.includes(`${path.sep}node_modules${path.sep}`)) return false;
    if (basename === '.env') return false;
    if (rel === 'uploads' || rel.startsWith(`uploads${path.sep}`)) return false;
    if (rel === 'temp' || rel.startsWith(`temp${path.sep}`)) return false;
    if (/^test\d*\.js$/i.test(basename)) return false;
    if (basename.endsWith('.log')) return false;
    if (basename === 'quote_creation_error.log') return false;
    return true;
}

function copyDirFiltered(srcDir, destDir, filterFn) {
    fs.mkdirSync(destDir, { recursive: true });
    for (const name of fs.readdirSync(srcDir)) {
        const src = path.join(srcDir, name);
        const dest = path.join(destDir, name);
        if (!filterFn(src)) continue;
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
            copyDirFiltered(src, dest, filterFn);
        } else {
            fs.copyFileSync(src, dest);
        }
    }
}

function verifyFrontendBundle() {
    const assetsDir = path.join(FRONTEND_DIR, 'assets');
    if (!fs.existsSync(assetsDir)) {
        console.error('❌ frontend/assets missing after build copy.');
        process.exit(1);
    }
    const mainJs = fs.readdirSync(assetsDir).find((f) => /^index-.*\.js$/.test(f));
    if (!mainJs) {
        console.error('❌ No index-*.js in frontend/assets');
        process.exit(1);
    }
    const bundle = fs.readFileSync(path.join(assetsDir, mainJs), 'utf8');
    const missing = FRONTEND_BUNDLE_MARKERS.filter((m) => !bundle.includes(m));
    if (missing.length) {
        console.error('❌ Frontend bundle missing PDF fix markers:', missing.join(', '));
        console.error('   Rebuild with .env.production (VITE_SERVER_ORIGIN=http://151.50.1.114:81)');
        process.exit(1);
    }
    console.log(`✅ Verified frontend PDF fix in assets/${mainJs}`);
}

function patchBackendPackageJsonFor2012R2() {
    const pkgPath = path.join(BACKEND_DIR, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.dependencies?.puppeteer) {
        pkg.dependencies.puppeteer = '19.4.0';
    }
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    console.log('✅ backend/package.json pinned puppeteer@19.4.0 (Windows Server 2012 R2).');
}

function writeEnvProduction2012R2() {
    const stable = path.join(PROJECT_ROOT, 'deploy', 'production.2012r2.env');
    const dest = path.join(BACKEND_DIR, '.env.production.2012r2');
    if (fs.existsSync(stable)) {
        fs.copyFileSync(stable, dest);
        console.log('✅ backend/.env.production.2012r2 (from deploy/production.2012r2.env)');
        return;
    }
    const content = `# EMS Production — Windows Server 2012 R2 (151.50.1.114:81)
# Copy to backend/.env on first install, or let helpers\\REPLACE_AND_RESTART.bat do it.
# After changes: pm2 restart EMS-API --update-env

DB_USER=your_db_username
DB_PASSWORD=your_db_password
DB_SERVER=151.50.1.116
DB_DATABASE=EMS_DB

PORT=5002
EMS_PUBLIC_API_URL=http://151.50.1.114:81

SMTP_HOST=almoayyedcg-com.mail.protection.outlook.com
SMTP_PORT=25
SMTP_USER=ems@almoayyedcg.com
SMTP_PASS=your_smtp_password
SMTP_ENCRYPTION=STARTTLS
SMTP_IPV4=1

ENQUIRY_ATTACHMENTS_ROOT=\\\\151.50.20.129\\ems app
EMS_ENQUIRY_NOTIFY_VIA_SMTP=1
EMS_ENQUIRY_NOTIFY_SMTP_FALLBACK=1
EMS_OUTLOOK_HELPER_PORT=39281

EMS_QUOTE_PDF_SERVER_ENABLED=1
QUOTE_PDF_ASSET_ORIGIN=http://127.0.0.1:5002
QUOTE_PDF_USE_FILE_LOAD=1
QUOTE_PDF_SINGLE_PROCESS=0
PUPPETEER_LAUNCH_TIMEOUT_MS=180000
QUOTE_PDF_PAGE_TIMEOUT_MS=180000
EMS_QUOTE_PDF_PERF_LOG=1
EMS_QUOTE_PDF_DEBUG_PAGINATION=1
QUOTE_PDF_RESTRICT=1

PUPPETEER_CHROME_MILESTONE=109
PUPPETEER_EXECUTABLE_PATH=C:\\inetpub\\wwwroot\\EMS\\backend\\.cache\\chromium-chrome109\\chrome-win-1069273\\chrome-win\\chrome.exe
`;
    fs.writeFileSync(dest, content, 'utf8');
}

function verifyRequiredFiles() {
    const missing = REQUIRED_BACKEND_PATHS.filter((p) => !fs.existsSync(path.join(BACKEND_DIR, p)));
    if (missing.length) {
        console.error('❌ Package verification failed — missing backend files:');
        missing.forEach((p) => console.error('   -', p));
        process.exit(1);
    }
    const quotesJs = fs.readFileSync(path.join(BACKEND_DIR, 'routes/quotes.js'), 'utf8');
    if (!quotesJs.includes("router.post('/outlook-draft'")) {
        console.error('❌ routes/quotes.js is missing POST /outlook-draft');
        process.exit(1);
    }
    const indexJs = fs.readFileSync(path.join(BACKEND_DIR, 'index.js'), 'utf8');
    if (!indexJs.includes('/api/quote-pdf')) {
        console.error('❌ index.js is missing /api/quote-pdf mount');
        process.exit(1);
    }
    if (!indexJs.includes('resolveWritableEnquiryUploadDestination')) {
        console.error('❌ index.js missing enquiry attachment local-fallback (resolveWritableEnquiryUploadDestination)');
        process.exit(1);
    }
    if (!indexJs.includes('/api/system/attachment-storage-probe')) {
        console.error('❌ index.js missing /api/system/attachment-storage-probe');
        process.exit(1);
    }
    const attachmentsRoot = fs.readFileSync(path.join(BACKEND_DIR, 'lib/attachmentsRoot.js'), 'utf8');
    if (!attachmentsRoot.includes('resolveWritableEnquiryUploadDestination')) {
        console.error('❌ lib/attachmentsRoot.js missing UNC local-fallback writer');
        process.exit(1);
    }
    const quotePdfJs = fs.readFileSync(path.join(BACKEND_DIR, 'routes/quotePdf.js'), 'utf8');
    if (!quotePdfJs.includes(PDF_CSS_VERSION)) {
        console.error(`❌ routes/quotePdf.js missing quotePdfCssVersion: ${PDF_CSS_VERSION}`);
        process.exit(1);
    }
    const exportCss = fs.readFileSync(path.join(BACKEND_DIR, 'lib/quotePrintExportCss.cjs'), 'utf8');
    const hasFooterPin =
        exportCss.includes('margin-top: auto') ||
        (exportCss.includes('grid-template-rows: auto minmax(0, 1fr) auto') &&
            exportCss.includes('.footer-section') &&
            exportCss.includes('grid-row: 3'));
    if (!hasFooterPin) {
        console.error(
            '❌ quotePrintExportCss.cjs missing footer pin (margin-top: auto or A4 grid footer row)'
        );
        process.exit(1);
    }
    const chromeResolver = fs.readFileSync(path.join(BACKEND_DIR, 'lib/resolvePuppeteerChrome.js'), 'utf8');
    if (!chromeResolver.includes('trustedEnvPath')) {
        console.error('❌ resolvePuppeteerChrome.js missing trustedEnvPath fix (Chrome 109 on 2012 R2)');
        process.exit(1);
    }
    if (!chromeResolver.includes('chromium-chrome')) {
        console.error('❌ resolvePuppeteerChrome.js missing chromium-chrome109 cache search');
        process.exit(1);
    }
    console.log('✅ Verified PDF + Outlook/email draft backend modules.');
}

function writeEnvProductionExample() {
    const content = `# EMS Production — copy to .env (Node.js 22 LTS required)
# See PRODUCTION_DEPLOYMENT_BASELINE.md

# --- Database (EMS production) ---
DB_USER=your_db_username
DB_PASSWORD=your_db_password
DB_SERVER=151.50.1.116
DB_DATABASE=EMS_DB

PORT=5002

# --- SMTP (enquiry notifications from server) ---
SMTP_HOST=almoayyedcg-com.mail.protection.outlook.com
SMTP_PORT=25
SMTP_USER=ems@almoayyedcg.com
SMTP_PASS=your_smtp_password
SMTP_ENCRYPTION=STARTTLS
SMTP_IPV4=1

# --- Attachments (UNC — PM2 user needs Modify) ---
ENQUIRY_ATTACHMENTS_ROOT=\\\\151.50.20.129\\ems app

# --- Enquiry notifications (Outlook COM fails under PM2/IIS) ---
EMS_ENQUIRY_NOTIFY_VIA_SMTP=1
EMS_ENQUIRY_NOTIFY_SMTP_FALLBACK=1

# --- Quote PDF (REQUIRED for server PDF = local behavior) ---
EMS_QUOTE_PDF_SERVER_ENABLED=1
# Puppeteer on server uses loopback Express — keep 127.0.0.1:5002 (NOT http://151.50.1.114:81).
# Users open EMS at :81; frontend build sets VITE_SERVER_ORIGIN=http://151.50.1.114:81.
QUOTE_PDF_ASSET_ORIGIN=http://127.0.0.1:5002
# Windows Server 2012 R2: puppeteer@19.4.0 + Chrome 109 only (see WINDOWS_SERVER_2012_R2_PDF.md)
# Do NOT run: npx puppeteer browsers install chrome (installs Chrome 146 — fails on 2012 R2)
# PUPPETEER_CHROME_MILESTONE=109
# PUPPETEER_EXECUTABLE_PATH=C:\\inetpub\\wwwroot\\EMS\\backend\\.cache\\chromium-chrome109\\chrome-win-1069273\\chrome-win\\chrome.exe
PUPPETEER_LAUNCH_TIMEOUT_MS=180000
QUOTE_PDF_PAGE_TIMEOUT_MS=180000
QUOTE_PDF_USE_FILE_LOAD=1
QUOTE_PDF_SINGLE_PROCESS=0

# --- PDF diagnostics (PM2 logs) ---
EMS_QUOTE_PDF_PERF_LOG=1
EMS_QUOTE_PDF_DEBUG_PAGINATION=1

# --- PDF restrictions (muhammara native module — Node 22 only) ---
# Set 0 if muhammara fails after npm ci; PDF generation still works
QUOTE_PDF_RESTRICT=1
# QUOTE_PDF_OWNER_PASSWORD=EMS-Quote-Owner-Do-Not-Share

# --- Frontend build (informational; set at Vite build time) ---
# VITE_QUOTE_PDF_BROWSER_DOWNLOAD=0
`;
    fs.writeFileSync(path.join(BACKEND_DIR, '.env.production.example'), content, 'utf8');
    fs.writeFileSync(path.join(BACKEND_DIR, '.env.example'), content, 'utf8');
}

function copyDeployExtras() {
    const lockSrc = path.join(PROJECT_ROOT, 'server', 'package-lock.json');
    if (fs.existsSync(lockSrc)) {
        fs.copyFileSync(lockSrc, path.join(BACKEND_DIR, 'package-lock.json'));
    } else {
        console.warn('⚠️ server/package-lock.json missing — run npm install in server/ before packaging.');
    }
    const nvmrc = path.join(PROJECT_ROOT, 'server', '.nvmrc');
    if (fs.existsSync(nvmrc)) {
        fs.copyFileSync(nvmrc, path.join(BACKEND_DIR, '.nvmrc'));
    } else {
        fs.writeFileSync(path.join(BACKEND_DIR, '.nvmrc'), '22\n', 'utf8');
    }
    const ecoSrc = path.join(PROJECT_ROOT, 'deploy', 'ecosystem.config.cjs');
    if (fs.existsSync(ecoSrc)) {
        fs.copyFileSync(ecoSrc, path.join(DEPLOY_DIR, 'ecosystem.config.cjs'));
    }
    const baselineSrc = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_DEPLOYMENT_BASELINE.md');
    if (fs.existsSync(baselineSrc)) {
        fs.copyFileSync(baselineSrc, path.join(DEPLOY_DIR, 'PRODUCTION_DEPLOYMENT_BASELINE.md'));
    }
    const ws2012Src = path.join(PROJECT_ROOT, 'docs', 'WINDOWS_SERVER_2012_R2_PDF.md');
    if (fs.existsSync(ws2012Src)) {
        fs.copyFileSync(ws2012Src, path.join(DEPLOY_DIR, 'WINDOWS_SERVER_2012_R2_PDF.md'));
    }
    const enterpriseGuideSrc = path.join(PROJECT_ROOT, 'docs', 'IIS_ENTERPRISE_DEPLOYMENT_GUIDE.md');
    if (fs.existsSync(enterpriseGuideSrc)) {
        fs.copyFileSync(enterpriseGuideSrc, path.join(DEPLOY_DIR, 'IIS_ENTERPRISE_DEPLOYMENT_GUIDE.md'));
    }
    fs.mkdirSync(path.join(DEPLOY_DIR, 'logs'), { recursive: true });
    fs.writeFileSync(
        path.join(DEPLOY_DIR, 'logs', '.gitkeep'),
        '',
        'utf8'
    );
}

function writeDeploymentGuide() {
    const guide = `# EMS IIS Deployment Guide

Package: **EMS_Deploy_${dateStamp}**  
Layout matches production reference \`EMS_Deploy_2026-06-03\`.

## Package contents

| Folder | Purpose |
|--------|---------|
| \`frontend/\` | React build + \`web.config\` (IIS SPA + /api proxy) |
| \`frontend/dist/\` | Same assets (legacy IIS paths) |
| \`backend/\` | Node.js API (Express) — **install node_modules on server** |
| \`helpers/\` | Outlook local helper + utility batch files |

### Included features (this release)

- **Quote PDF**: \`POST /api/quote-pdf/generate\` (Puppeteer / Chrome, browser pool + perf timing)
- **Quote Outlook draft**: \`POST /api/quotes/outlook-draft\` (Windows COM — API must run on a PC with classic Outlook if used)
- **Quote email fields**: \`GET /api/quotes/outlook-email-fields\`
- **Quote .eml draft**: \`POST /api/quotes/email-draft\`
- **Enquiry Outlook/SMTP**: \`/api/enquiries/outlook-*\`
- **Pricing / Quote search sorting**, probability date filters (current app build)

---

## Prerequisites (Windows Server)

1. **IIS** with URL Rewrite + Application Request Routing (ARR) proxy enabled  
2. **Node.js 22 LTS** (64-bit) — **not Node 24** (see PRODUCTION_DEPLOYMENT_BASELINE.md)  
3. **SQL Server** reachable from the API host  
4. **Google Chrome** (or Chromium) for quote PDF — path in \`backend/.env\`  
5. **PM2** (recommended): \`npm install -g pm2\`

---

## Step 1 — Copy files

Example target:

\`\`\`
C:\\inetpub\\wwwroot\\EMS\\
  frontend\\
  backend\\
  helpers\\
\`\`\`

Copy this entire \`EMS_Deploy_${dateStamp}\` folder contents to the server (or copy \`frontend\` + \`backend\` + \`helpers\` into your existing EMS site root).

This package includes \`backend\\uploads\` from dev (logos, quote files). On **fresh** IIS install, deploy as-is.

If the server already has a **larger** live \`uploads\` tree, **merge** (do not delete server-only files) or keep the server copy and only copy missing \`logos\\\` files from the package.

---

## Step 2 — Permissions

On **C:\\inetpub\\wwwroot\\EMS\\** (or your site root):

- **IIS_IUSRS** / **IUSR**: Read on **frontend**
- **PM2 / service account** running Node: **Modify** on **backend\\uploads**, **backend\\temp** (create if missing), and attachment UNC path from **.env**

---

## Step 3 — Backend configuration

\`\`\`powershell
cd C:\\inetpub\\wwwroot\\EMS\\backend
copy .env.production.example .env
notepad .env
\`\`\`

**Required:** \`EMS_QUOTE_PDF_SERVER_ENABLED=1\` (if false, health shows server PDF disabled).

---

## Step 4 — Install API dependencies (on server, Node 22)

\`\`\`powershell
cd C:\\inetpub\\wwwroot\\EMS\\backend
node -v
npm ci --omit=dev
npx puppeteer browsers install chrome
\`\`\`

Or run \`helpers\\install_dependencies.bat\`. **Do not copy node_modules from another PC.**

---

## Step 5 — Start API with PM2

\`\`\`powershell
cd C:\\inetpub\\wwwroot\\EMS
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
\`\`\`

After \`.env\` changes: \`pm2 restart EMS-API --update-env\`

Verify PDF health:

\`\`\`
http://localhost:5002/api/quote-pdf/health?launch=1
\`\`\`

Expect: \`emsQuotePdfServerEnabled: true\`, \`quotePdfCssVersion: "${PDF_CSS_VERSION}"\`, \`launchProbe.ok: true\`.

**Redeploy (existing server):** copy package → run \`REPLACE_AND_RESTART.bat\` — see \`ONE_CLICK_DEPLOY.md\`.

---

## Step 6 — IIS website

1. IIS Manager → **Add Website**  
   - Physical path: \`C:\\inetpub\\wwwroot\\EMS\\frontend\`  
   - Port: **80** or your HTTPS binding  
2. Site → **URL Rewrite** — frontend/web.config proxies /api/* → http://localhost:5002/api/*  
3. Server level → **Application Request Routing** → **Enable proxy**

**Long requests:** Increase IIS/ARR timeout for quote PDF (up to 3 minutes). Adjust ARR proxyTimeout if PDFs fail at 120s.

---

## Step 7 — Quote email / Outlook on user PCs

Server-side \`/api/quotes/outlook-draft\` only works if Node runs **on the same Windows desktop** as **classic Outlook** (unusual on IIS).

**Recommended for end users:**

1. On each estimator PC, run at login (optional):  
   node C:\\inetpub\\wwwroot\\EMS\\helpers\\quote-outlook-local-helper.cjs  
   Or double-click helpers\\start-outlook-helper.bat
2. Helper listens on **http://127.0.0.1:39281** and opens Outlook with PDF attached when users click **Email** in EMS.

---

## Step 8 — Smoke tests

| Test | Expected |
|------|----------|
| Open EMS home | UI loads |
| Enquiry list | Data from API |
| Quote → Download PDF | PDF without blank pages |
| Quote → Email (helper running) | Outlook draft with PDF |
| GET /api/quote-pdf/health | \`emsQuotePdfServerEnabled: true\`, \`quotePdfCssVersion\` set |
| PM2 logs | \`[quote-pdf][perf]\` on PDF download |

**Full baseline:** \`PRODUCTION_DEPLOYMENT_BASELINE.md\`  
**Enterprise walkthrough (151.50.1.114:81):** \`IIS_ENTERPRISE_DEPLOYMENT_GUIDE.md\`

### IIS port 81 quick setup (Administrator PowerShell)

\`\`\`powershell
cd C:\\inetpub\\wwwroot\\EMS\\helpers
.\\configure_arr.ps1
.\\setup_iis_site_port81.ps1
\`\`\`

User URL: **http://151.50.1.114:81**

---

## Rollback

1. Stop PM2: pm2 stop EMS-API  
2. Restore previous frontend + backend folders from backup  
3. pm2 restart EMS-API

---

## Troubleshooting

- **PDF 500 / chrome_not_configured**: Install Chrome; set PUPPETEER_EXECUTABLE_PATH; run npx puppeteer browsers install chrome as the PM2 user.  
- **Blank PDF pages**: Use server PDF (this build); do not set VITE_QUOTE_PDF_BROWSER_DOWNLOAD=1 when building frontend.  
- **Outlook does not open**: Start local helper on the user PC; use classic Outlook, not “New Outlook”.  
- **API 502 from IIS**: PM2 not running or wrong port in \`web.config\`.  
- **emsQuotePdfServerEnabled false**: Set \`EMS_QUOTE_PDF_SERVER_ENABLED=1\` in \`.env\`, \`pm2 restart EMS-API --update-env\`.  
- **muhammara NODE_MODULE_VERSION**: Server must use **Node 22**, then \`npm ci --omit=dev\`. Or \`QUOTE_PDF_RESTRICT=0\`.  
- **Enquiry upload EPERM on UNC**: PM2 as SYSTEM uses **HOSTNAME$** on the share — grant Modify on \`\\\\151.50.20.129\\ems app\\Enquiries\` to the web server computer account, or run PM2 as a domain user with share access. This build auto-falls back to \`EMS\\data\\ems-attachments\` when UNC is not writable. Probe: \`/api/system/attachment-storage-probe?requestNo=187&division=BMS%20Project\`.  
`;
    fs.writeFileSync(path.join(DEPLOY_DIR, 'DEPLOYMENT_GUIDE.md'), guide, 'utf8');
}

function writeReplaceAndRestartScripts() {
    const replaceBat = `@echo off
title EMS — One-click redeploy (PM2 restart)
cd /d "%~dp0"
echo ============================================================
echo   EMS redeploy — site root: %CD%
echo   Package: EMS_Deploy_${dateStamp}
echo   Expected CSS: ${PDF_CSS_VERSION}
echo ============================================================
echo.
if not exist backend\\index.js (
  echo ERROR: Run this from C:\\inetpub\\wwwroot\\EMS after copying the package.
  pause
  exit /b 1
)
if not exist backend\\.env (
  if exist backend\\.env.production.2012r2 (
    echo Creating backend\\.env from .env.production.2012r2 ...
    copy /Y backend\\.env.production.2012r2 backend\\.env >nul
  ) else (
    echo ERROR: backend\\.env missing. Copy .env.production.2012r2 to .env first.
    pause
    exit /b 1
  )
)
if not exist backend\\node_modules (
  echo ERROR: backend\\node_modules missing — first-time install required.
  echo Run once: helpers\\fix_puppeteer_pdf_ws2012.bat
  echo Then run this script again.
  pause
  exit /b 1
)
if not exist backend\\.cache\\chromium-chrome109 (
  echo WARNING: Chrome 109 cache not found. PDF may fail until you run:
  echo   helpers\\fix_puppeteer_pdf_ws2012.bat
  echo.
)
if not exist logs mkdir logs
echo [1/2] Restarting PM2 EMS-API ...
pm2 describe EMS-API >nul 2>&1
if errorlevel 1 (
  pm2 start ecosystem.config.cjs
  pm2 save
) else (
  pm2 restart EMS-API --update-env
  pm2 save
)
echo.
echo [2/2] Verifying PDF health (may take up to 2 min) ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0helpers\\verify_pdf_production.ps1"
set VERIFY_ERR=%ERRORLEVEL%
echo.
if %VERIFY_ERR% equ 0 (
  echo ============================================================
  echo   DONE — open http://151.50.1.114:81 and hard-refresh Ctrl+Shift+R
  echo ============================================================
) else (
  echo ============================================================
  echo   PM2 restarted but verification failed — see messages above.
  echo   If Chrome/Puppeteer failed: helpers\\fix_puppeteer_pdf_ws2012.bat
  echo ============================================================
)
pause
exit /b %VERIFY_ERR%
`;
    fs.writeFileSync(path.join(DEPLOY_DIR, 'REPLACE_AND_RESTART.bat'), replaceBat, 'utf8');
    fs.writeFileSync(path.join(HELPERS_DIR, 'REPLACE_AND_RESTART.bat'), replaceBat, 'utf8');
}

function writeOneClickDeployMd() {
    const doc = `# EMS One-Click Redeploy (${dateStamp})

**Target:** \`C:\\inetpub\\wwwroot\\EMS\` on **151.50.1.114:81** (Windows Server 2012 R2)

This package includes the **footer-pin PDF fix** (\`quotePdfCssVersion: ${PDF_CSS_VERSION}\`).

---

## Quick redeploy (existing server — one restart)

### Step 1 — Copy package to server

Copy **everything** in this folder into \`C:\\inetpub\\wwwroot\\EMS\\\`:

| Copy from package | To server |
|-------------------|-----------|
| \`frontend\\\` | \`C:\\inetpub\\wwwroot\\EMS\\frontend\\\` (replace all) |
| \`backend\\\` | \`C:\\inetpub\\wwwroot\\EMS\\backend\\\` (replace files) |
| \`helpers\\\` | \`C:\\inetpub\\wwwroot\\EMS\\helpers\\\` |
| \`ecosystem.config.cjs\` | \`C:\\inetpub\\wwwroot\\EMS\\\` |

**Do NOT delete or overwrite on the server:**

- \`backend\\.env\` — production secrets + Chrome 109 path
- \`backend\\node_modules\\\` — already installed (puppeteer@19.4.0)
- \`backend\\uploads\\\` — logos and stored files
- \`backend\\.cache\\chromium-chrome109\\\` — Chrome 109 binary

### Step 2 — Run one script (as PM2 user)

Double-click:

\`\`\`
C:\\inetpub\\wwwroot\\EMS\\REPLACE_AND_RESTART.bat
\`\`\`

Or from PowerShell:

\`\`\`powershell
cd C:\\inetpub\\wwwroot\\EMS
.\\REPLACE_AND_RESTART.bat
\`\`\`

### Step 3 — Browser

Open **http://151.50.1.114:81** → press **Ctrl+Shift+R** (hard refresh).

Test **Quote → Download PDF** — footer should sit at bottom of page 1.

---

## First-time server install (no node_modules yet)

1. Copy package as above (no \`.env\` on server yet).
2. Run **once:** \`helpers\\fix_puppeteer_pdf_ws2012.bat\` (installs puppeteer@19.4.0 + Chrome 109).
3. Run \`REPLACE_AND_RESTART.bat\`.

---

## User PCs (Quote Email / Outlook)

Copy \`helpers\\quote-outlook-local-helper.cjs\` to each estimator PC, or run:

\`\`\`
helpers\\start-outlook-helper.bat
\`\`\`

Helper listens on **http://127.0.0.1:39281**.

---

## Verify after deploy

| Check | Expected |
|-------|----------|
| \`http://151.50.1.114:81/api/quote-pdf/health?launch=1\` | \`quotePdfCssVersion: "${PDF_CSS_VERSION}"\` |
| Same JSON | \`launchProbe.ok: true\`, \`chromeSpawnProbe.ok: true\` |
| Browser F12 during Download PDF | \`[QuotePerf] PDF Download complete\` (no html2pdf fallback) |

Run: \`helpers\\verify_pdf_production.ps1\`

---

## Full guide

See \`DEPLOYMENT_GUIDE.md\` and \`WINDOWS_SERVER_2012_R2_PDF.md\`.
`;
    fs.writeFileSync(path.join(DEPLOY_DIR, 'ONE_CLICK_DEPLOY.md'), doc, 'utf8');
}

function writeHelperScripts() {
    fs.mkdirSync(HELPERS_DIR, { recursive: true });

    const verifySrc = path.join(PROJECT_ROOT, 'scripts', 'verify_pdf_production.ps1');
    if (fs.existsSync(verifySrc)) {
        fs.copyFileSync(verifySrc, path.join(HELPERS_DIR, 'verify_pdf_production.ps1'));
    }

    const helperSrc = path.join(PROJECT_ROOT, 'scripts', 'quote-outlook-local-helper.cjs');
    if (fs.existsSync(helperSrc)) {
        fs.copyFileSync(helperSrc, path.join(HELPERS_DIR, 'quote-outlook-local-helper.cjs'));
    }
    for (const name of ['fix_puppeteer_pdf_ws2012.bat', 'install_chrome109_ws2012.ps1']) {
        const fromScripts = path.join(PROJECT_ROOT, 'scripts', name);
        const fromHelpers = path.join(PROJECT_ROOT, 'EMS_Deploy_2026-06-06', 'helpers', name);
        const src = fs.existsSync(fromScripts) ? fromScripts : fromHelpers;
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(HELPERS_DIR, name));
        }
    }

    fs.writeFileSync(
        path.join(HELPERS_DIR, 'start-outlook-helper.bat'),
        `@echo off
title EMS Quote Outlook Helper
cd /d "%~dp0"
echo Starting EMS Outlook helper on http://127.0.0.1:39281
echo Keep this window open while using Quote Email in EMS.
node quote-outlook-local-helper.cjs
pause
`,
        'utf8'
    );

    fs.writeFileSync(
        path.join(HELPERS_DIR, 'install_dependencies.bat'),
        `@echo off
title EMS Backend - First install (2012 R2)
echo Windows Server 2012 R2: use fix_puppeteer_pdf_ws2012.bat instead of npx puppeteer browsers install chrome.
echo.
call "%~dp0fix_puppeteer_pdf_ws2012.bat"
`,
        'utf8'
    );

    fs.writeFileSync(
        path.join(HELPERS_DIR, 'fix_puppeteer_pdf.bat'),
        `@echo off
title EMS Fix Puppeteer PDF
echo === EMS Puppeteer PDF repair ===
echo Windows user: %USERDOMAIN%\\%USERNAME%
echo PM2 is per-user — run this script as the account that owns EMS-API.
echo.
cd /d "%~dp0..\\backend"
node -v
echo.
echo [1/5] Delete corrupt Puppeteer cache (fixes spawn EFTYPE from copied binaries)
if exist .cache\\puppeteer (
  rd /s /q .cache\\puppeteer
  echo Removed .cache\\puppeteer
)
echo.
echo [2/5] Reinstall Puppeteer Chrome locally on this server
call npx puppeteer browsers install chrome
if errorlevel 1 exit /b 1
echo.
echo [3/5] Verify Chrome path + spawn probe
node -e "const r=require('./lib/resolvePuppeteerChrome');const p=require('puppeteer');const x=r.resolvePuppeteerChromeExecutable(p);console.log(JSON.stringify(x,null,2));if(!x.executablePath||x.spawnProbe&&!x.spawnProbe.ok)process.exit(1)"
echo.
echo [4/5] PM2 status (current user)
cd ..
pm2 list
echo.
echo [5/5] Start or restart EMS-API
pm2 describe EMS-API >nul 2>&1
if errorlevel 1 (
  echo EMS-API not found for %USERNAME% — starting fresh...
  if not exist logs mkdir logs
  pm2 start ecosystem.config.cjs
  pm2 save
) else (
  pm2 restart EMS-API --update-env
  pm2 save
)
pm2 list
echo.
echo Test: curl http://localhost:5002/api/quote-pdf/health?launch=1
pause
`,
        'utf8'
    );

    fs.writeFileSync(
        path.join(HELPERS_DIR, 'start_api_pm2.bat'),
        `@echo off
title EMS API - PM2
cd /d "%~dp0.."
if not exist backend\\.env (
  echo Copy backend\\.env.production.example to backend\\.env first.
  pause
  exit /b 1
)
if not exist logs mkdir logs
pm2 start ecosystem.config.cjs
pm2 save
echo API started. Check: http://localhost:5002/api/quote-pdf/health?launch=1
pause
`,
        'utf8'
    );

    fs.writeFileSync(
        path.join(HELPERS_DIR, 'verify_production.bat'),
        `@echo off
title EMS Production Verify
echo Node:
node -v
echo.
echo API health (direct):
curl -s http://localhost:5002/api/quote-pdf/health?launch=1
echo.
echo API health (via IIS :81):
curl -s http://localhost:81/api/quote-pdf/health
echo.
pause
`,
        'utf8'
    );

    fs.writeFileSync(
        path.join(HELPERS_DIR, 'redeploy.bat'),
        `@echo off
title EMS Redeploy (code update only — preserves node_modules + Chrome 109)
call "%~dp0REPLACE_AND_RESTART.bat"
`,
        'utf8'
    );

    fs.writeFileSync(
        path.join(HELPERS_DIR, 'install_on_user_pc.bat'),
        `@echo off
title EMS Outlook Helper - User PC Setup
echo Install the EMS Outlook helper on this Windows PC.
echo Requires: Node.js 22, Classic Outlook (not New Outlook)
echo.
cd /d "%~dp0"
echo Helper folder: %CD%
echo.
echo Testing backend resolution...
node -e "require('./quote-outlook-local-helper.cjs')" 2>nul
if errorlevel 1 (
  echo.
  echo If backend not found, copy the full EMS folder from the server:
  echo   \\\\151.50.1.114\\EMS\\
  echo so that backend\\ sits next to helpers\\
  echo.
)
echo Starting helper (keep window open or add to Startup folder)...
node quote-outlook-local-helper.cjs
`,
        'utf8'
    );

    fs.writeFileSync(
        path.join(HELPERS_DIR, 'configure_arr.ps1'),
        `# Requires: Run as Administrator
# Enables ARR reverse proxy and sets 180s timeout for quote PDF generation.
Import-Module WebAdministration -ErrorAction Stop
Write-Host "Enabling ARR proxy..."
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'enabled' -Value 'True'
Write-Host "Setting proxy timeout to 180 seconds..."
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'timeout' -Value '00:03:00'
Write-Host "ARR configured. Restart IIS if needed: iisreset"
`,
        'utf8'
    );

    fs.writeFileSync(
        path.join(HELPERS_DIR, 'setup_iis_site_port81.ps1'),
        [
            '# Requires: Run as Administrator',
            '# Creates EMS app pool + website on port 81 for http://151.50.1.114:81',
            'param(',
            "    [string]$SiteRoot = 'C:\\inetpub\\wwwroot\\EMS',",
            "    [string]$SiteName = 'EMS',",
            "    [string]$AppPoolName = 'EMS-Web',",
            '    [int]$Port = 81,',
            "    [string]$BindingIp = '151.50.1.114'",
            ')',
            'Import-Module WebAdministration -ErrorAction Stop',
            "$frontendPath = Join-Path $SiteRoot 'frontend'",
            'if (-not (Test-Path $frontendPath)) { throw "frontend not found: $frontendPath" }',
            '',
            'if (-not (Test-Path "IIS:\\AppPools\\$AppPoolName")) {',
            '    New-WebAppPool -Name $AppPoolName',
            '    Set-ItemProperty "IIS:\\AppPools\\$AppPoolName" managedRuntimeVersion \'\'',
            '    Write-Host "Created app pool: $AppPoolName"',
            '}',
            '',
            '$existing = Get-Website -Name $SiteName -ErrorAction SilentlyContinue',
            'if ($existing) {',
            '    Write-Host "Site $SiteName already exists - updating physical path and binding."',
            '    Set-ItemProperty "IIS:\\Sites\\$SiteName" -Name physicalPath -Value $frontendPath',
            '    Set-ItemProperty "IIS:\\Sites\\$SiteName" -Name applicationPool -Value $AppPoolName',
            '} else {',
            '    New-Website -Name $SiteName -PhysicalPath $frontendPath -ApplicationPool $AppPoolName -Port $Port -IPAddress $BindingIp',
            '    Write-Host "Created site $SiteName on ${BindingIp}:$Port"',
            '}',
            '',
            'Write-Host "Physical path: $frontendPath"',
            'Write-Host "User URL: http://${BindingIp}:$Port"',
            'Write-Host "Next: run configure_arr.ps1, start PM2, verify health endpoint."',
        ].join('\n'),
        'utf8'
    );
}

/** Copy server/uploads (logos, quote files) — required for PDF logos on fresh IIS install. */
function copyBackendUploads() {
    const srcUploads = path.join(PROJECT_ROOT, 'server', 'uploads');
    const destUploads = path.join(BACKEND_DIR, 'uploads');
    if (!fs.existsSync(srcUploads)) {
        fs.mkdirSync(destUploads, { recursive: true });
        return { fileCount: 0, totalBytes: 0, subdirs: [] };
    }
    console.log('Copying backend/uploads (logos + stored files)...');
    fs.cpSync(srcUploads, destUploads, { recursive: true, force: true });
    let fileCount = 0;
    let totalBytes = 0;
    const subdirs = [];
    const walk = (dir, relBase) => {
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            const rel = relBase ? `${relBase}/${name}` : name;
            const st = fs.statSync(full);
            if (st.isDirectory()) {
                if (!relBase) subdirs.push(name);
                walk(full, rel);
            } else {
                fileCount += 1;
                totalBytes += st.size;
            }
        }
    };
    walk(destUploads, '');
    const manifest = {
        copiedAt: new Date().toISOString(),
        source: 'server/uploads',
        fileCount,
        totalBytes,
        totalMb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
        subdirs: subdirs.sort(),
    };
    fs.writeFileSync(path.join(destUploads, 'UPLOADS_MANIFEST.json'), JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`✅ uploads: ${fileCount} files (${manifest.totalMb} MB), folders: ${subdirs.join(', ') || '(root only)'}`);
    return manifest;
}

function writeManifest(uploadsMeta) {
    let buildNode = 'unknown';
    try {
        buildNode = execSync('node -v', { encoding: 'utf8' }).trim();
    } catch {
        /* ignore */
    }
    const manifest = {
        package: `EMS_Deploy_${dateStamp}`,
        baselineVersion: BASELINE_VERSION,
        quotePdfCssVersion: PDF_CSS_VERSION,
        builtAt: new Date().toISOString(),
        buildNode,
        nodeRequirement: '>=22.0.0 <23.0.0',
        npmInstallPolicy: 'npm ci --omit=dev on production server (do not copy node_modules)',
        includesNodeModules: withNodeModules && !skipNpmInstall,
        uploads: uploadsMeta || { fileCount: 0 },
        features: {
            quotePdf: [
                'routes/quotePdf.js',
                'lib/restrictQuotePdf.js',
                'lib/resolvePuppeteerChrome.js',
                'lib/quotePdfBrowserPool.cjs',
                'lib/quotePdfPerf.cjs',
                'lib/quotePrintExportCss.cjs',
                'lib/quotePrintSheetValidation.cjs',
                'lib/quotePdfPaginationDebug.cjs',
            ],
            quoteOutlookDraft: ['routes/quotes.js POST /outlook-draft', 'lib/outlookDraftVbs.js'],
            quoteEmailDraft: ['routes/quotes.js POST /email-draft', 'lib/quoteSmtpDraft.js'],
            enquiryOutlook: ['routes/enquiryOutlook.js', 'lib/runOutlookHtmlDraftVbs.js'],
            enquiryAttachments: [
                'lib/attachmentsRoot.js (UNC + local fallback)',
                'scripts/probe-attachment-storage.cjs',
                'GET /api/system/attachment-storage-probe',
                'POST /api/attachments/upload (multer JSON errors)',
            ],
        },
        requiredBackendFiles: REQUIRED_BACKEND_PATHS,
    };
    fs.writeFileSync(path.join(DEPLOY_DIR, 'PACKAGE_MANIFEST.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

console.log('========================================================');
console.log('  EMS IIS Deployment Package Builder');
console.log('========================================================');
console.log(`Target: ${DEPLOY_DIR}\n`);

if (fs.existsSync(DEPLOY_DIR)) {
    console.log('Removing previous package folder...');
    fs.rmSync(DEPLOY_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DEPLOY_DIR, { recursive: true });

console.log('Building frontend (production mode)...');
try {
    execSync('npm run build', {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' },
    });
} catch (err) {
    console.error('Frontend build failed.');
    process.exit(1);
}

console.log('Copying frontend...');
fs.mkdirSync(FRONTEND_DIR, { recursive: true });
fs.mkdirSync(FRONTEND_DIST_DIR, { recursive: true });
const distDir = path.join(PROJECT_ROOT, 'dist');
if (!fs.existsSync(distDir)) {
    console.error('dist/ not found after build.');
    process.exit(1);
}
fs.cpSync(distDir, FRONTEND_DIR, { recursive: true });
fs.cpSync(distDir, FRONTEND_DIST_DIR, { recursive: true });

const webConfigSrc = path.join(PROJECT_ROOT, 'public', 'web.config');
if (fs.existsSync(webConfigSrc)) {
    fs.copyFileSync(webConfigSrc, path.join(FRONTEND_DIR, 'web.config'));
    fs.copyFileSync(webConfigSrc, path.join(FRONTEND_DIST_DIR, 'web.config'));
}

const proxySrc = path.join(PROJECT_ROOT, 'proxy-server.cjs');
if (fs.existsSync(proxySrc)) {
    fs.copyFileSync(proxySrc, path.join(FRONTEND_DIR, 'proxy-server.cjs'));
    fs.copyFileSync(proxySrc, path.join(FRONTEND_DIST_DIR, 'proxy-server.cjs'));
}

if (fs.existsSync(webConfigSrc)) {
    fs.copyFileSync(webConfigSrc, path.join(DEPLOY_DIR, 'web.config'));
}

console.log('Copying backend...');
copyDirFiltered(path.join(PROJECT_ROOT, 'server'), BACKEND_DIR, shouldCopyBackendEntry);
fs.mkdirSync(path.join(BACKEND_DIR, 'temp'), { recursive: true });

let uploadsMeta = { fileCount: 0, skipped: true };
if (skipUploads) {
    fs.mkdirSync(path.join(BACKEND_DIR, 'uploads'), { recursive: true });
    console.log('Skipped uploads copy (--skip-uploads).');
} else {
    uploadsMeta = copyBackendUploads();
    if (uploadsMeta.fileCount === 0) {
        console.warn('⚠️ server/uploads is empty — PDF logos may be missing until logos are uploaded.');
    }
}

copyDeployExtras();
writeEnvProductionExample();
writeEnvProduction2012R2();
patchBackendPackageJsonFor2012R2();
verifyRequiredFiles();
verifyFrontendBundle();
writeHelperScripts();
writeReplaceAndRestartScripts();
writeOneClickDeployMd();
writeDeploymentGuide();
writeManifest(uploadsMeta);

if (withNodeModules && !skipNpmInstall) {
    console.log('Installing backend deps on build machine (npm ci — for smoke test only)...');
    try {
        const lock = path.join(BACKEND_DIR, 'package-lock.json');
        if (fs.existsSync(lock)) {
            execSync('npm ci --omit=dev', { cwd: BACKEND_DIR, stdio: 'inherit' });
        } else {
            execSync('npm install --omit=dev', { cwd: BACKEND_DIR, stdio: 'inherit' });
        }
        console.log('✅ backend/node_modules installed (re-run npm ci on server with Node 22).');
    } catch (err) {
        console.warn('⚠️ npm ci failed — run helpers/install_dependencies.bat on the server.');
    }
} else {
    console.log('Package ships without node_modules — run helpers/install_dependencies.bat on server (Node 22).');
    if (fs.existsSync(path.join(BACKEND_DIR, 'node_modules'))) {
        fs.rmSync(path.join(BACKEND_DIR, 'node_modules'), { recursive: true, force: true });
    }
}

console.log('\n========================================================');
console.log('✅ Deployment package ready:');
console.log(`   ${DEPLOY_DIR}`);
console.log('   Read DEPLOYMENT_GUIDE.md in that folder.');
console.log('========================================================\n');
