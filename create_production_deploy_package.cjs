/**
 * Complete production deployment package for a FRESH Windows Server 2022.
 * Target site: C:\inetpub\wwwroot\EMS
 * Access URL: http://151.50.1.38 (IIS proxies /api → localhost:5002)
 *
 * Usage: node create_production_deploy_package.cjs
 *
 * Output:
 *   EMS_Deploy_Production/
 *   EMS_Deploy_Production.zip
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = __dirname;
const PUBLIC_URL = 'http://151.50.1.38';
const SITE_ROOT = 'C:\\inetpub\\wwwroot\\EMS';
const API_PORT = 5002;
const PACKAGE_NAME = 'EMS_Deploy_Production';
const DEPLOY_DIR = path.join(PROJECT_ROOT, PACKAGE_NAME);
const FRONTEND_DIR = path.join(DEPLOY_DIR, 'frontend');
const BACKEND_DIR = path.join(DEPLOY_DIR, 'backend');
const HELPERS_DIR = path.join(DEPLOY_DIR, 'helpers');
const ZIP_PATH = path.join(PROJECT_ROOT, `${PACKAGE_NAME}.zip`);
const BASELINE = `2026-07-23-ws2022-fresh-${new Date().toISOString().slice(0, 10)}`;

const FRONTEND_BUNDLE_MARKERS = [
    'data-ems-html2pdf',
    'margin-top: auto !important',
    'grid-template-rows: auto minmax(0, 1fr) auto !important',
];

const REQUIRED_BACKEND = [
    'index.js',
    'package.json',
    'routes/quotePdf.js',
    'routes/quotes.js',
    'lib/attachmentsRoot.js',
    'lib/resolvePuppeteerChrome.js',
    '.puppeteerrc.cjs',
];

function rmrf(p) {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function mkdirp(p) {
    fs.mkdirSync(p, { recursive: true });
}

function write(file, content) {
    mkdirp(path.dirname(file));
    fs.writeFileSync(file, content.replace(/\n/g, '\r\n'), 'utf8');
}

function copyFile(src, dest) {
    mkdirp(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

function shouldCopyBackend(src) {
    const rel = path.relative(path.join(PROJECT_ROOT, 'server'), src);
    const basename = path.basename(src);
    if (!rel || rel.startsWith('..')) return false;
    if (basename === 'node_modules' || rel.includes(`${path.sep}node_modules${path.sep}`)) return false;
    if (basename === '.env') return false;
    if (rel === 'uploads' || rel.startsWith(`uploads${path.sep}`)) return false;
    if (rel === 'temp' || rel.startsWith(`temp${path.sep}`)) return false;
    if (basename.endsWith('.log')) return false;
    if (/^test\d*\.js$/i.test(basename)) return false;
    return true;
}

function copyDirFiltered(srcDir, destDir, filterFn) {
    mkdirp(destDir);
    for (const name of fs.readdirSync(srcDir)) {
        const src = path.join(srcDir, name);
        const dest = path.join(destDir, name);
        if (!filterFn(src)) continue;
        const stat = fs.statSync(src);
        if (stat.isDirectory()) copyDirFiltered(src, dest, filterFn);
        else fs.copyFileSync(src, dest);
    }
}

function run(cmd, opts = {}) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: 'inherit', ...opts });
}

function buildFrontend() {
    console.log('\n[1/8] Building production frontend...');
    run('npm run build', {
        cwd: PROJECT_ROOT,
        env: {
            ...process.env,
            NODE_ENV: 'production',
            VITE_SERVER_ORIGIN: PUBLIC_URL,
            VITE_API_PORT: String(API_PORT),
            VITE_QUOTE_PDF_BROWSER_DOWNLOAD: '0',
        },
    });
    const dist = path.join(PROJECT_ROOT, 'dist');
    if (!fs.existsSync(dist)) throw new Error('dist/ missing after vite build');
    mkdirp(FRONTEND_DIR);
    fs.cpSync(dist, FRONTEND_DIR, { recursive: true });
}

function writeWebConfig() {
    const webConfig = `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <security>
      <requestFiltering>
        <!-- 100 MB — enquiry / quote attachments through IIS -->
        <requestLimits maxAllowedContentLength="104857600" />
      </requestFiltering>
    </security>
    <rewrite>
      <rules>
        <rule name="API Proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:${API_PORT}/api/{R:1}" />
        </rule>
        <rule name="Uploads Proxy" stopProcessing="true">
          <match url="^uploads/(.*)" />
          <action type="Rewrite" url="http://localhost:${API_PORT}/uploads/{R:1}" />
        </rule>
        <rule name="React Routes" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
            <add input="{REQUEST_URI}" pattern="^/api/" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
    <staticContent>
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <mimeMap fileExtension=".webp" mimeType="image/webp" />
    </staticContent>
    <httpProtocol>
      <customHeaders>
        <remove name="X-Powered-By" />
      </customHeaders>
    </httpProtocol>
  </system.webServer>
</configuration>
`;
    write(path.join(FRONTEND_DIR, 'web.config'), webConfig);
    write(path.join(DEPLOY_DIR, 'web.config'), webConfig);
}

function copyBackend() {
    console.log('\n[2/8] Copying backend source...');
    copyDirFiltered(path.join(PROJECT_ROOT, 'server'), BACKEND_DIR, shouldCopyBackend);
    mkdirp(path.join(BACKEND_DIR, 'temp'));
    mkdirp(path.join(BACKEND_DIR, 'uploads'));
    mkdirp(path.join(BACKEND_DIR, 'logs'));
    mkdirp(path.join(BACKEND_DIR, 'data', 'ems-attachments'));

    // Keep modern puppeteer for Windows Server 2022 (do NOT pin to 19.4.0)
    const pkgPath = path.join(BACKEND_DIR, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.dependencies?.puppeteer && String(pkg.dependencies.puppeteer).startsWith('19.')) {
        pkg.dependencies.puppeteer = '^24.6.0';
        fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    }
}

function installBackendDeps() {
    console.log('\n[3/8] Installing production node_modules into package...');
    const lock = path.join(BACKEND_DIR, 'package-lock.json');
    try {
        if (fs.existsSync(lock)) {
            run('npm ci --omit=dev', { cwd: BACKEND_DIR });
        } else {
            run('npm install --omit=dev', { cwd: BACKEND_DIR });
        }
    } catch (err) {
        console.warn('npm ci failed — falling back to npm install --omit=dev');
        run('npm install --omit=dev', { cwd: BACKEND_DIR });
    }
    if (!fs.existsSync(path.join(BACKEND_DIR, 'node_modules'))) {
        throw new Error('backend/node_modules missing after install');
    }
}

function writeEnvExample() {
    write(
        path.join(BACKEND_DIR, '.env.example'),
        `# =============================================================================
# EMS Production .env — Windows Server 2022
# Location after deploy: ${SITE_ROOT}\\backend\\.env
# Access URL: ${PUBLIC_URL}
# After changes: pm2 restart EMS-API --update-env
# =============================================================================

# --- Database ---
DB_USER=bmsuser
DB_PASSWORD=CHANGE_ME
DB_SERVER=151.50.1.116
DB_DATABASE=EMS_DB

# --- API (PM2 listens here; IIS proxies /api → localhost:${API_PORT}) ---
PORT=${API_PORT}
EMS_PUBLIC_API_URL=${PUBLIC_URL}

# --- SMTP (enquiry notifications from server) ---
SMTP_HOST=almoayyedcg-com.mail.protection.outlook.com
SMTP_PORT=25
SMTP_USER=ems@almoayyedcg.com
SMTP_PASS=CHANGE_ME
SMTP_ENCRYPTION=STARTTLS
SMTP_IPV4=1

# --- File attachments ---
# Strict UNC only — never write to backend data\\ems-attachments
ENQUIRY_ATTACHMENTS_ROOT=\\\\151.50.20.129\\ems app
EMS_ATTACHMENTS_DISABLE_LOCAL_FALLBACK=1

# --- Enquiry email (Outlook COM fails under PM2/service) ---
EMS_ENQUIRY_NOTIFY_VIA_SMTP=1
EMS_ENQUIRY_NOTIFY_SMTP_FALLBACK=1
EMS_OUTLOOK_HELPER_PORT=39281

# --- Quote PDF (server-side Puppeteer) ---
EMS_QUOTE_PDF_SERVER_ENABLED=1
# Puppeteer loads assets via loopback Express — NOT the public IIS URL
QUOTE_PDF_ASSET_ORIGIN=http://127.0.0.1:${API_PORT}
QUOTE_PDF_USE_FILE_LOAD=1
QUOTE_PDF_SINGLE_PROCESS=0
PUPPETEER_LAUNCH_TIMEOUT_MS=180000
QUOTE_PDF_PAGE_TIMEOUT_MS=180000
EMS_QUOTE_PDF_PERF_LOG=1
EMS_QUOTE_PDF_DEBUG_PAGINATION=1
QUOTE_PDF_RESTRICT=1

# --- Chrome for Puppeteer (Windows Server 2022) ---
# After helpers\\install_chrome_puppeteer.bat, either leave blank (auto-detect)
# or set the path printed by that script:
# PUPPETEER_EXECUTABLE_PATH=C:\\...\\chrome.exe
`
    );
}

function writeEcosystem() {
    write(
        path.join(DEPLOY_DIR, 'ecosystem.config.cjs'),
        `/**
 * PM2 production config — run from site root (${SITE_ROOT}):
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup
 */
module.exports = {
    apps: [
        {
            name: 'EMS-API',
            cwd: './backend',
            script: 'index.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            max_memory_restart: '2500M',
            node_args: '--no-watch',
            env: {
                NODE_ENV: 'production',
            },
            error_file: './logs/ems-api-error.log',
            out_file: './logs/ems-api-out.log',
            merge_logs: true,
            time: true,
        },
    ],
};
`
    );
}

function writeHelpers() {
    console.log('\n[4/8] Writing helpers...');
    mkdirp(HELPERS_DIR);

    const outlookSrc = path.join(PROJECT_ROOT, 'scripts', 'quote-outlook-local-helper.cjs');
    if (fs.existsSync(outlookSrc)) {
        copyFile(outlookSrc, path.join(HELPERS_DIR, 'quote-outlook-local-helper.cjs'));
    }

    write(
        path.join(HELPERS_DIR, 'install_chrome_puppeteer.bat'),
        `@echo off
title EMS — Install Chrome for Puppeteer (Windows Server 2022)
cd /d "%~dp0..\\backend"
echo ============================================================
echo   Install Chromium for quote PDF (Puppeteer)
echo   Run as the SAME Windows user that runs PM2 / EMS-API
echo ============================================================
echo.
node -v
if errorlevel 1 (
  echo ERROR: Node.js not found. Install Node.js 22 LTS first.
  exit /b 1
)
echo.
echo Installing Chrome via Puppeteer...
call npx puppeteer browsers install chrome
if errorlevel 1 (
  echo ERROR: Chrome install failed.
  exit /b 1
)
echo.
echo Resolving Chrome executable...
node -e "const r=require('./lib/resolvePuppeteerChrome');const p=require('puppeteer');const x=r.resolvePuppeteerChromeExecutable(p);console.log(JSON.stringify(x,null,2));if(!x.executablePath)process.exit(1)"
if errorlevel 1 (
  echo ERROR: Could not resolve Chrome path.
  exit /b 1
)
echo.
echo SUCCESS. Optionally set PUPPETEER_EXECUTABLE_PATH in backend\\.env to the path above.
echo Then: pm2 restart EMS-API --update-env
exit /b 0
`
    );

    write(
        path.join(HELPERS_DIR, 'configure_arr.ps1'),
        `# Requires: Run as Administrator
# Enables ARR reverse proxy and sets 180s timeout for quote PDF generation.
Import-Module WebAdministration -ErrorAction Stop
Write-Host "Enabling ARR proxy..."
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'enabled' -Value 'True'
Write-Host "Setting proxy timeout to 180 seconds..."
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'timeout' -Value '00:03:00'
Write-Host "ARR configured. Restart IIS if needed: iisreset"
`
    );

    write(
        path.join(HELPERS_DIR, 'setup_iis_site.ps1'),
        `# Requires: Run as Administrator
# Creates EMS app pool + website bound to http://151.50.1.38:80
param(
    [string]$SiteRoot = '${SITE_ROOT}',
    [string]$SiteName = 'EMS',
    [string]$AppPoolName = 'EMS-Web',
    [int]$Port = 80,
    [string]$BindingIp = '*'
)
Import-Module WebAdministration -ErrorAction Stop
$frontendPath = Join-Path $SiteRoot 'frontend'
if (-not (Test-Path $frontendPath)) { throw "frontend not found: $frontendPath" }

if (-not (Test-Path "IIS:\\AppPools\\$AppPoolName")) {
    New-WebAppPool -Name $AppPoolName
    Set-ItemProperty "IIS:\\AppPools\\$AppPoolName" managedRuntimeVersion ''
    Write-Host "Created app pool: $AppPoolName"
}

$existing = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Site $SiteName already exists — updating physical path and binding..."
    Set-ItemProperty "IIS:\\Sites\\$SiteName" -Name physicalPath -Value $frontendPath
} else {
    if ($BindingIp -eq '*') {
        New-Website -Name $SiteName -PhysicalPath $frontendPath -ApplicationPool $AppPoolName -Port $Port
    } else {
        New-Website -Name $SiteName -PhysicalPath $frontendPath -ApplicationPool $AppPoolName -Port $Port -IPAddress $BindingIp
    }
    Write-Host "Created website: $SiteName on port $Port"
}

Write-Host "Done. Ensure URL Rewrite + ARR proxy are installed and enabled."
Write-Host "Test: ${PUBLIC_URL}/"
Write-Host "API via IIS: ${PUBLIC_URL}/api/health"
`
    );

    write(
        path.join(HELPERS_DIR, 'start-outlook-helper.bat'),
        `@echo off
title EMS Quote Outlook Helper
cd /d "%~dp0"
echo Starting EMS Outlook helper on http://127.0.0.1:39281
echo Keep this window open while using Quote Email in EMS.
node quote-outlook-local-helper.cjs
pause
`
    );

    write(
        path.join(HELPERS_DIR, 'open_firewall_ports.ps1'),
        `# Requires: Run as Administrator
# Opens HTTP (80) for IIS. Backend 5002 stays LOCAL ONLY (do not expose publicly).
New-NetFirewallRule -DisplayName "EMS IIS HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -ErrorAction SilentlyContinue
Write-Host "Opened inbound TCP 80 for IIS."
Write-Host "Do NOT open TCP ${API_PORT} to the internet — only IIS should reach localhost:${API_PORT}."
`
    );
}

function writeDeployScripts() {
    console.log('\n[5/8] Writing Deploy / Rollback / Verify / Restart scripts...');

    write(
        path.join(DEPLOY_DIR, 'Deploy.bat'),
        `@echo off
setlocal EnableExtensions
title EMS Production Deploy — Windows Server 2022
cd /d "%~dp0"

set "SITE=${SITE_ROOT}"
set "BACKUP=%SITE%_backup_%DATE:~-4%%DATE:~3,2%%DATE:~0,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
set "BACKUP=%BACKUP: =0%"
set "API_PORT=${API_PORT}"
set "PUBLIC_URL=${PUBLIC_URL}"

echo ============================================================
echo   EMS Production Deploy
echo   Target: %SITE%
echo   Public URL: %PUBLIC_URL%
echo ============================================================
echo.

REM --- Prerequisites ---
where node >nul 2>&1
if errorlevel 1 (
  echo [FAIL] Node.js not found. Install Node.js 22 LTS, then re-run Deploy.bat
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo [OK] Node %%v

where npm >nul 2>&1
if errorlevel 1 (
  echo [FAIL] npm not found.
  exit /b 1
)

where pm2 >nul 2>&1
if errorlevel 1 (
  echo [INFO] PM2 not found — installing globally...
  call npm install -g pm2
  if errorlevel 1 (
    echo [FAIL] Could not install PM2.
    exit /b 1
  )
)
for /f "tokens=*" %%v in ('pm2 -v') do echo [OK] PM2 %%v

if not exist "frontend\\index.html" (
  echo [FAIL] frontend\\index.html missing — incomplete package.
  exit /b 1
)
if not exist "backend\\index.js" (
  echo [FAIL] backend\\index.js missing — incomplete package.
  exit /b 1
)
if not exist "backend\\node_modules" (
  echo [FAIL] backend\\node_modules missing — package must include production deps.
  exit /b 1
)
if not exist "ecosystem.config.cjs" (
  echo [FAIL] ecosystem.config.cjs missing.
  exit /b 1
)

REM --- Backup existing site ---
if exist "%SITE%\\backend\\index.js" (
  echo [INFO] Existing install found — creating backup:
  echo        %BACKUP%
  mkdir "%BACKUP%" 2>nul
  xcopy "%SITE%" "%BACKUP%\\" /E /I /H /Y /Q
  if errorlevel 1 (
    echo [WARN] Backup copy reported errors — review before continuing.
  ) else (
    echo [OK] Backup created.
  )
) else (
  echo [INFO] No previous EMS install at %SITE%
)

REM --- Deploy files ---
echo.
echo [INFO] Creating site folders...
mkdir "%SITE%" 2>nul
mkdir "%SITE%\\frontend" 2>nul
mkdir "%SITE%\\backend" 2>nul
mkdir "%SITE%\\helpers" 2>nul
mkdir "%SITE%\\logs" 2>nul
mkdir "%SITE%\\data\\ems-attachments" 2>nul
mkdir "%SITE%\\backend\\uploads" 2>nul
mkdir "%SITE%\\backend\\temp" 2>nul
mkdir "%SITE%\\backend\\logs" 2>nul

echo [INFO] Copying frontend...
xcopy "frontend\\*" "%SITE%\\frontend\\" /E /I /H /Y /Q
echo [INFO] Copying backend (includes node_modules)...
xcopy "backend\\*" "%SITE%\\backend\\" /E /I /H /Y /Q
echo [INFO] Copying helpers...
xcopy "helpers\\*" "%SITE%\\helpers\\" /E /I /H /Y /Q
copy /Y "ecosystem.config.cjs" "%SITE%\\ecosystem.config.cjs" >nul
copy /Y "web.config" "%SITE%\\web.config" >nul
copy /Y "Deploy.bat" "%SITE%\\Deploy.bat" >nul
copy /Y "Rollback.bat" "%SITE%\\Rollback.bat" >nul
copy /Y "Verify.bat" "%SITE%\\Verify.bat" >nul
copy /Y "Restart.bat" "%SITE%\\Restart.bat" >nul
if exist "README_DEPLOYMENT.md" copy /Y "README_DEPLOYMENT.md" "%SITE%\\README_DEPLOYMENT.md" >nul
if exist "IIS_DEPLOYMENT_GUIDE.md" copy /Y "IIS_DEPLOYMENT_GUIDE.md" "%SITE%\\IIS_DEPLOYMENT_GUIDE.md" >nul

REM Preserve existing .env; otherwise create from example
if exist "%SITE%\\backend\\.env" (
  echo [OK] Preserved existing backend\\.env
) else (
  if exist "%SITE%\\backend\\.env.example" (
    copy /Y "%SITE%\\backend\\.env.example" "%SITE%\\backend\\.env" >nul
    echo [WARN] Created backend\\.env from .env.example — EDIT passwords before going live.
  ) else (
    echo [FAIL] No backend\\.env and no .env.example
    exit /b 1
  )
)

REM --- PM2 start ---
echo.
echo [INFO] Starting EMS-API with PM2...
cd /d "%SITE%"
pm2 describe EMS-API >nul 2>&1
if errorlevel 1 (
  pm2 start ecosystem.config.cjs
) else (
  pm2 restart EMS-API --update-env
)
if errorlevel 1 (
  echo [FAIL] PM2 start/restart failed.
  exit /b 1
)
pm2 save
echo [OK] PM2 saved.

REM --- Chrome for PDF (best-effort) ---
echo.
echo [INFO] Ensuring Puppeteer Chrome is installed...
call "%SITE%\\helpers\\install_chrome_puppeteer.bat"
if errorlevel 1 (
  echo [WARN] Chrome install failed — quote PDF may not work until you fix Chrome.
) else (
  pm2 restart EMS-API --update-env >nul 2>&1
  pm2 save >nul 2>&1
)

REM --- Health checks ---
echo.
echo [INFO] Waiting for API...
timeout /t 3 /nobreak >nul
curl -s -o NUL -w "%%{http_code}" "http://127.0.0.1:%API_PORT%/api/health" > "%TEMP%\\ems_health.txt" 2>nul
set /p HEALTH=<%TEMP%\\ems_health.txt
if "%HEALTH%"=="200" (
  echo [OK] Backend health HTTP %HEALTH%
) else (
  echo [WARN] Backend health returned: %HEALTH%  (expected 200)
)

curl -s "http://127.0.0.1:%API_PORT%/api/quote-pdf/health" > "%TEMP%\\ems_pdf.txt" 2>nul
findstr /I "emsQuotePdfServerEnabled" "%TEMP%\\ems_pdf.txt" >nul 2>&1
if errorlevel 1 (
  echo [WARN] Quote PDF health check did not return expected JSON.
) else (
  echo [OK] Quote PDF health endpoint responded.
)

echo.
echo ============================================================
echo   Deploy complete (backend started).
echo ============================================================
echo.
echo NEXT — IIS (run as Administrator):
echo   1. Install IIS + URL Rewrite + Application Request Routing (ARR)
echo   2. Enable ARR proxy:
echo        powershell -ExecutionPolicy Bypass -File "%SITE%\\helpers\\configure_arr.ps1"
echo   3. Create site:
echo        powershell -ExecutionPolicy Bypass -File "%SITE%\\helpers\\setup_iis_site.ps1"
echo   4. Firewall (HTTP only — do NOT open port %API_PORT% publicly):
echo        powershell -ExecutionPolicy Bypass -File "%SITE%\\helpers\\open_firewall_ports.ps1"
echo   5. Edit "%SITE%\\backend\\.env" (DB + SMTP passwords)
echo   6. pm2 restart EMS-API --update-env
echo   7. Open %PUBLIC_URL%
echo   8. Run Verify.bat
echo.
echo Backend listens on localhost:%API_PORT% only — IIS proxies /api.
echo See README_DEPLOYMENT.md and IIS_DEPLOYMENT_GUIDE.md
echo ============================================================
exit /b 0
`
    );

    write(
        path.join(DEPLOY_DIR, 'Rollback.bat'),
        `@echo off
setlocal EnableExtensions
title EMS Rollback
cd /d "%~dp0"

set "SITE=${SITE_ROOT}"
echo ============================================================
echo   EMS Rollback — restore from backup folder
echo ============================================================
echo.
echo Available backups (sibling folders):
dir /b /ad "%SITE%_backup_*" 2>nul
echo.
set /p BACKUP_PATH=Enter full path of backup folder to restore: 
if not exist "%BACKUP_PATH%\\backend\\index.js" (
  echo [FAIL] Invalid backup: %BACKUP_PATH%
  exit /b 1
)

echo Stopping PM2 EMS-API...
pm2 stop EMS-API >nul 2>&1

echo Restoring files from:
echo   %BACKUP_PATH%
echo to:
echo   %SITE%
xcopy "%BACKUP_PATH%\\*" "%SITE%\\" /E /I /H /Y /Q
if errorlevel 1 (
  echo [FAIL] Restore copy failed.
  exit /b 1
)

cd /d "%SITE%"
pm2 restart EMS-API --update-env
if errorlevel 1 pm2 start ecosystem.config.cjs
pm2 save
echo.
echo [OK] Rollback complete. Run Verify.bat
exit /b 0
`
    );

    write(
        path.join(DEPLOY_DIR, 'Verify.bat'),
        `@echo off
setlocal EnableExtensions
title EMS Verify Production
cd /d "%~dp0"

set "SITE=${SITE_ROOT}"
if exist "%SITE%\\ecosystem.config.cjs" cd /d "%SITE%"

set "API_PORT=${API_PORT}"
set "PUBLIC_URL=${PUBLIC_URL}"
set FAIL=0

echo ============================================================
echo   EMS Production Verification
echo ============================================================
echo.

echo [1] Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo   FAIL — Node not in PATH
  set FAIL=1
) else (
  for /f "tokens=*" %%v in ('node -v') do echo   OK — %%v
)

echo [2] PM2
where pm2 >nul 2>&1
if errorlevel 1 (
  echo   FAIL — PM2 not installed
  set FAIL=1
) else (
  for /f "tokens=*" %%v in ('pm2 -v') do echo   OK — PM2 %%v
  pm2 jlist > "%TEMP%\\ems_pm2.json" 2>nul
  findstr /I "\\"name\\":\\"EMS-API\\"" "%TEMP%\\ems_pm2.json" >nul 2>&1
  if errorlevel 1 (
    echo   FAIL — EMS-API not in PM2 process list
    set FAIL=1
  ) else (
    findstr /I "\\"status\\":\\"online\\"" "%TEMP%\\ems_pm2.json" >nul 2>&1
    if errorlevel 1 (
      echo   WARN — EMS-API may not be online. Check: pm2 list
    ) else (
      echo   OK — EMS-API present (check pm2 list for online)
    )
  )
)

echo [3] Port %API_PORT% listening
netstat -ano | findstr ":%API_PORT% " | findstr LISTENING >nul 2>&1
if errorlevel 1 (
  echo   FAIL — nothing listening on %API_PORT%
  set FAIL=1
) else (
  echo   OK — %API_PORT% LISTENING
)

echo [4] Backend /api/health
curl -s -o "%TEMP%\\ems_h.json" -w "%%{http_code}" "http://127.0.0.1:%API_PORT%/api/health" > "%TEMP%\\ems_hc.txt" 2>nul
set /p HC=<%TEMP%\\ems_hc.txt
if "%HC%"=="200" (
  echo   OK — HTTP 200
) else (
  echo   FAIL — HTTP %HC%
  set FAIL=1
)

echo [5] Quote PDF health
curl -s "http://127.0.0.1:%API_PORT%/api/quote-pdf/health" > "%TEMP%\\ems_pdf.json" 2>nul
findstr /I "emsQuotePdfServerEnabled" "%TEMP%\\ems_pdf.json" >nul 2>&1
if errorlevel 1 (
  echo   FAIL — quote-pdf health not responding
  set FAIL=1
) else (
  echo   OK — quote-pdf health JSON received
  type "%TEMP%\\ems_pdf.json"
  echo.
)

echo [6] Chrome executable (Puppeteer)
if exist "backend\\index.js" (
  cd backend
  node -e "try{const r=require('./lib/resolvePuppeteerChrome');const p=require('puppeteer');const x=r.resolvePuppeteerChromeExecutable(p);if(x.executablePath){console.log('  OK — '+x.executablePath);process.exit(0)}console.log('  FAIL — no Chrome path');process.exit(1)}catch(e){console.log('  FAIL — '+e.message);process.exit(1)}"
  if errorlevel 1 set FAIL=1
  cd ..
) else (
  echo   SKIP — backend not found in current folder
)

echo [7] IIS public URL %PUBLIC_URL%
curl -s -o NUL -w "%%{http_code}" "%PUBLIC_URL%/" > "%TEMP%\\ems_iis.txt" 2>nul
set /p IIS=<%TEMP%\\ems_iis.txt
if "%IIS%"=="200" (
  echo   OK — IIS HTTP 200
) else if "%IIS%"=="000" (
  echo   WARN — IIS not reachable yet (configure IIS / DNS / firewall)
) else (
  echo   WARN — IIS HTTP %IIS% (site may still need ARR / bindings)
)

echo.
if "%FAIL%"=="0" (
  echo ============================================================
  echo   RESULT: CORE CHECKS PASSED
  echo ============================================================
  exit /b 0
) else (
  echo ============================================================
  echo   RESULT: SOME CHECKS FAILED — see above
  echo ============================================================
  exit /b 1
)
`
    );

    write(
        path.join(DEPLOY_DIR, 'Restart.bat'),
        `@echo off
setlocal EnableExtensions
title EMS Restart
cd /d "%~dp0"
set "SITE=${SITE_ROOT}"
if exist "%SITE%\\ecosystem.config.cjs" cd /d "%SITE%"

echo Restarting EMS-API...
pm2 restart EMS-API --update-env
if errorlevel 1 (
  echo EMS-API not found — starting...
  pm2 start ecosystem.config.cjs
)
pm2 save
pm2 list
echo.
echo Health:
curl -s http://127.0.0.1:${API_PORT}/api/health
echo.
exit /b 0
`
    );
}

function writeDocs() {
    console.log('\n[6/8] Writing documentation...');

    write(
        path.join(DEPLOY_DIR, 'README_DEPLOYMENT.md'),
        `# EMS Production Deployment — Windows Server 2022

**Target folder:** \`${SITE_ROOT}\`  
**Public URL (initial):** ${PUBLIC_URL}  
**Backend:** Node.js + Express on **localhost:${API_PORT}** (PM2)  
**Frontend:** React build served by **IIS** (proxies \`/api\` → \`localhost:${API_PORT}\`)

> Backend must **never** be exposed publicly. Only IIS (port 80/443) is public.

---

## Package contents

| Path | Purpose |
|------|---------|
| \`frontend/\` | React production build + \`web.config\` |
| \`backend/\` | Express API + **production \`node_modules\`** |
| \`backend/.env.example\` | Copy to \`.env\` and fill secrets |
| \`helpers/\` | Chrome install, IIS/ARR, Outlook helper |
| \`ecosystem.config.cjs\` | PM2 process config |
| \`Deploy.bat\` | One-click deploy to \`${SITE_ROOT}\` |
| \`Verify.bat\` | Health / PM2 / PDF / IIS checks |
| \`Restart.bat\` | Restart API |
| \`Rollback.bat\` | Restore from \`*_backup_*\` folder |
| \`IIS_DEPLOYMENT_GUIDE.md\` | IIS + ARR + rewrite details |

---

## Prerequisites (fresh server)

### 1. Node.js 22 LTS (x64)

1. Download Node.js **22 LTS** from https://nodejs.org  
2. Install for **all users**  
3. Open **new** Command Prompt:

\`\`\`bat
node -v
npm -v
\`\`\`

Expect \`v22.x.x\`.

### 2. PM2

\`\`\`bat
npm install -g pm2
pm2 -v
\`\`\`

\`Deploy.bat\` installs PM2 automatically if missing.

### 3. IIS + modules

Install via **Server Manager → Add Roles and Features**:

- Web Server (IIS)
- Common HTTP Features
- Application Development (optional ASP.NET not required for static React)

Then install:

1. **URL Rewrite** — https://www.iis.net/downloads/microsoft/url-rewrite  
2. **Application Request Routing (ARR) 3.0** — https://www.iis.net/downloads/microsoft/application-request-routing  

Enable proxy (Admin PowerShell):

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File C:\\inetpub\\wwwroot\\EMS\\helpers\\configure_arr.ps1
\`\`\`

### 4. Chrome for Puppeteer (quote PDF)

Run as the **same Windows user** that runs PM2:

\`\`\`bat
C:\\inetpub\\wwwroot\\EMS\\helpers\\install_chrome_puppeteer.bat
\`\`\`

\`Deploy.bat\` tries this automatically.

### 5. Firewall

- **Allow inbound TCP 80** (HTTP) for IIS  
- **Do not** open TCP **${API_PORT}** to the network  

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File C:\\inetpub\\wwwroot\\EMS\\helpers\\open_firewall_ports.ps1
\`\`\`

### 6. SQL / network

- Server can reach SQL (\`DB_SERVER\` in \`.env\`)  
- If using UNC attachments, the **PM2 Windows account** needs **Modify** on the share  

---

## Deployment

1. Copy \`EMS_Deploy_Production.zip\` to the server and extract.  
2. Edit \`backend\\.env.example\` values if you want (or edit after deploy).  
3. Run **as Administrator** (recommended):

\`\`\`bat
Deploy.bat
\`\`\`

4. Edit \`${SITE_ROOT}\\backend\\.env\` — set real \`DB_PASSWORD\`, \`SMTP_PASS\`, attachment path.  
5. Configure IIS (see \`IIS_DEPLOYMENT_GUIDE.md\` or run \`helpers\\setup_iis_site.ps1\`).  
6. Restart API:

\`\`\`bat
Restart.bat
\`\`\`

7. Verify:

\`\`\`bat
Verify.bat
\`\`\`

8. Open ${PUBLIC_URL}

---

## Rollback

\`Deploy.bat\` creates \`${SITE_ROOT}_backup_YYYYMMDD_HHMMSS\` when an existing install is found.

\`\`\`bat
Rollback.bat
\`\`\`

Enter the full backup folder path when prompted.

---

## Health verification

| Check | URL / command |
|-------|----------------|
| API (local) | \`http://127.0.0.1:${API_PORT}/api/health\` |
| Quote PDF | \`http://127.0.0.1:${API_PORT}/api/quote-pdf/health?launch=1\` |
| Via IIS | ${PUBLIC_URL}/api/health |
| PM2 | \`pm2 list\` / \`pm2 logs EMS-API\` |

---

## Logs

| Log | Location |
|-----|----------|
| PM2 out | \`${SITE_ROOT}\\logs\\ems-api-out.log\` |
| PM2 error | \`${SITE_ROOT}\\logs\\ems-api-error.log\` |
| Live | \`pm2 logs EMS-API\` |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| IIS 502 | PM2 not running or wrong port in \`web.config\` |
| \`/api\` 404 from IIS | URL Rewrite / ARR not installed or proxy disabled |
| Quote PDF fails | Run \`helpers\\install_chrome_puppeteer.bat\` as PM2 user |
| Attachment EPERM | Grant share Modify to PM2 account, or set local \`ENQUIRY_ATTACHMENTS_ROOT\` |
| DB errors | Check \`backend\\.env\` DB_* and SQL firewall |
| Domain later | Add IIS binding for hostname; update \`EMS_PUBLIC_API_URL\` and rebuild frontend \`VITE_SERVER_ORIGIN\` if needed |

---

## Later: map a domain

1. Add IIS site binding for the hostname (HTTP/HTTPS).  
2. Set \`EMS_PUBLIC_API_URL=https://your.domain\` in \`.env\`.  
3. Rebuild frontend with \`VITE_SERVER_ORIGIN=https://your.domain\` and redeploy \`frontend/\`.  
4. \`pm2 restart EMS-API --update-env\`
`
    );

    write(
        path.join(DEPLOY_DIR, 'IIS_DEPLOYMENT_GUIDE.md'),
        `# IIS Deployment Guide — EMS (Windows Server 2022)

## Architecture

\`\`\`
Browser → http://151.50.1.38 (IIS :80)
              │
              ├─ /api/*      → rewrite → http://localhost:${API_PORT}/api/*
              ├─ /uploads/*  → rewrite → http://localhost:${API_PORT}/uploads/*
              └─ /*          → React SPA (index.html)
\`\`\`

- **Public:** IIS only  
- **Private:** Node/PM2 on \`127.0.0.1:${API_PORT}\` — do not publish this port

Physical path for the IIS site: \`${SITE_ROOT}\\frontend\`  
(\`web.config\` in that folder performs the proxy + SPA fallback.)

---

## Install IIS roles

Server Manager → Add Roles and Features → Web Server (IIS):

- Static Content  
- Default Document  
- Directory Browsing (optional)  
- HTTP Errors  
- Request Filtering  

## Install URL Rewrite

https://www.iis.net/downloads/microsoft/url-rewrite

## Install Application Request Routing (ARR)

https://www.iis.net/downloads/microsoft/application-request-routing

Then enable proxy (Admin PowerShell):

\`\`\`powershell
Import-Module WebAdministration
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'enabled' -Value 'True'
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'timeout' -Value '00:03:00'
\`\`\`

Or:

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File ${SITE_ROOT}\\helpers\\configure_arr.ps1
\`\`\`

## Create the website

Option A — script:

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File ${SITE_ROOT}\\helpers\\setup_iis_site.ps1
\`\`\`

Option B — IIS Manager:

1. **Application Pools** → Add → Name \`EMS-Web\` → .NET CLR = **No Managed Code**  
2. **Sites** → Add Website  
   - Name: \`EMS\`  
   - Physical path: \`${SITE_ROOT}\\frontend\`  
   - Binding: \`http\`, IP All Unassigned (or \`151.50.1.38\`), Port **80**  
3. Assign app pool \`EMS-Web\`

## web.config rules (already in package)

- \`^api/(.*)\` → \`http://localhost:${API_PORT}/api/{R:1}\`  
- \`^uploads/(.*)\` → \`http://localhost:${API_PORT}/uploads/{R:1}\`  
- SPA fallback → \`/index.html\`  
- \`maxAllowedContentLength\` = 100 MB  

## ARR timeout for PDF

Quote PDF can take up to ~3 minutes. Proxy timeout is set to \`00:03:00\` in \`configure_arr.ps1\`.

## Verify through IIS

\`\`\`bat
curl http://127.0.0.1/api/health
curl ${PUBLIC_URL}/api/health
curl ${PUBLIC_URL}/
\`\`\`

If local Node works but IIS returns 502:

1. \`pm2 list\` — EMS-API online?  
2. ARR proxy enabled?  
3. URL Rewrite installed?  
4. \`web.config\` present under \`frontend\\\`?

## HTTPS / domain (later)

1. Bind certificate to site (port 443).  
2. Update \`EMS_PUBLIC_API_URL\` in \`backend\\.env\`.  
3. Rebuild frontend with matching \`VITE_SERVER_ORIGIN\`.  
4. Redeploy \`frontend/\` and restart PM2.
`
    );
}

function verifyPackage() {
    console.log('\n[7/8] Verifying package...');
    for (const p of REQUIRED_BACKEND) {
        if (!fs.existsSync(path.join(BACKEND_DIR, p))) {
            throw new Error(`Missing backend file: ${p}`);
        }
    }
    if (!fs.existsSync(path.join(BACKEND_DIR, 'node_modules'))) {
        throw new Error('Missing backend/node_modules');
    }
    if (!fs.existsSync(path.join(FRONTEND_DIR, 'index.html'))) {
        throw new Error('Missing frontend/index.html');
    }
    const assets = path.join(FRONTEND_DIR, 'assets');
    const mainJs = fs.readdirSync(assets).find((f) => f.startsWith('index-') && f.endsWith('.js'));
    if (!mainJs) throw new Error('No index-*.js in frontend/assets');
    const bundle = fs.readFileSync(path.join(assets, mainJs), 'utf8');
    const missing = FRONTEND_BUNDLE_MARKERS.filter((m) => !bundle.includes(m));
    if (missing.length) {
        console.warn('⚠️ Frontend markers missing (non-fatal for WS2022 package):', missing.join(', '));
    }
    console.log(`✅ Frontend bundle: ${mainJs}`);
    console.log('✅ Backend + node_modules present');
    return mainJs;
}

function writeManifest(frontendBundle) {
    let nodeV = 'unknown';
    try {
        nodeV = execSync('node -v', { encoding: 'utf8' }).trim();
    } catch {
        /* ignore */
    }
    const manifest = {
        package: PACKAGE_NAME,
        baselineVersion: BASELINE,
        builtAt: new Date().toISOString(),
        buildNode: nodeV,
        targetOs: 'Windows Server 2022 Standard x64',
        siteRoot: SITE_ROOT,
        publicUrl: PUBLIC_URL,
        apiPort: API_PORT,
        includesNodeModules: true,
        frontendBundle,
        features: {
            deployScripts: ['Deploy.bat', 'Rollback.bat', 'Verify.bat', 'Restart.bat'],
            iisProxy: '/api and /uploads → localhost:5002',
            chromeHelper: 'helpers/install_chrome_puppeteer.bat',
            docs: ['README_DEPLOYMENT.md', 'IIS_DEPLOYMENT_GUIDE.md'],
        },
    };
    fs.writeFileSync(path.join(DEPLOY_DIR, 'PACKAGE_MANIFEST.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

function zipPackage() {
    console.log('\n[8/8] Creating EMS_Deploy_Production.zip...');
    rmrf(ZIP_PATH);
    // Compress contents so extract yields frontend/, backend/, Deploy.bat at top level
    const ps = `Compress-Archive -Path '${DEPLOY_DIR.replace(/'/g, "''")}\\*' -DestinationPath '${ZIP_PATH.replace(/'/g, "''")}' -Force`;
    run(`powershell -NoProfile -Command "${ps}"`);
    const size = fs.statSync(ZIP_PATH).size;
    console.log(`✅ Zip: ${ZIP_PATH} (${(size / (1024 * 1024)).toFixed(1)} MB)`);
}

function main() {
    console.log('========================================================');
    console.log('  EMS Complete Production Package (Windows Server 2022)');
    console.log(`  Public URL: ${PUBLIC_URL}`);
    console.log(`  Site root:  ${SITE_ROOT}`);
    console.log('========================================================');

    rmrf(DEPLOY_DIR);
    mkdirp(DEPLOY_DIR);

    buildFrontend();
    writeWebConfig();
    copyBackend();
    writeEnvExample();
    installBackendDeps();
    writeEcosystem();
    writeHelpers();
    writeDeployScripts();
    writeDocs();
    const bundle = verifyPackage();
    writeManifest(bundle);
    zipPackage();

    console.log('\n========================================================');
    console.log('✅ Production package ready:');
    console.log(`   Folder: ${DEPLOY_DIR}`);
    console.log(`   Zip:    ${ZIP_PATH}`);
    console.log('   On server: extract → run Deploy.bat as Admin');
    console.log('========================================================\n');
}

main();
