# EMS Enterprise IIS Deployment Guide

**Target server:** `151.50.1.38`  
**User access URL:** `http://151.50.1.38`  
**Architecture:** IIS (static + reverse proxy) + PM2 (Node.js API) + SQL Server + UNC file shares

This guide is the permanent reference for first-time setup and all future redeployments.

---

## 1. Architecture overview

EMS is **not** a single IIS application. It is a **two-tier Windows deployment**:

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Windows Server 151.50.1.38                                            â”‚
â”‚                                                                         â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚  IIS Site :81    â”‚  proxy  â”‚  PM2 process "EMS-API"              â”‚ â”‚
â”‚  â”‚  EMS-Web pool    â”‚ â”€â”€â”€â”€â”€â”€â–º â”‚  Node.js 22 + Express :5002         â”‚ â”‚
â”‚  â”‚  frontend/       â”‚  /api   â”‚  backend/                           â”‚ â”‚
â”‚  â”‚  (React SPA)     â”‚  /uploadsâ”‚  Puppeteer Chrome (PDF)           â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚           â”‚                               â”‚                             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
            â”‚                               â”‚
     User browser                    SQL Server 151.50.1.116
     http://151.50.1.38         UNC \\151.50.20.129\ems app

â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Each estimator PC (separate from server)                               â”‚
â”‚  Outlook local helper :39281  â†’  Classic Outlook COM (draft + PDF)      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

| Component | Role | Why separate |
|-----------|------|--------------|
| **IIS** | Serves React UI, proxies `/api` and `/uploads` | Standard enterprise web hosting |
| **PM2** | Runs Node.js API 24/7, restarts on crash | Node does not run inside IIS (no iisnode) |
| **Puppeteer** | Server-side quote PDF generation | Must run under PM2 with Chrome installed |
| **Outlook helper** | Opens draft on **user's PC** | Outlook COM cannot run under IIS or Windows services |

### Why PDF and Outlook fail on IIS (root causes)

| Feature | Works locally because | Fails on IIS when |
|---------|----------------------|-------------------|
| **PDF download** | Dev machine has Chrome; Vite proxies API | PM2 user lacks Chrome, Edge is used instead of Chrome, ARR timeout < 180s, `EMS_QUOTE_PDF_SERVER_ENABLED=0` |
| **Outlook draft** | Node + Outlook on same desktop | Server has no interactive Outlook; helper not running on user PC, or helper paths point to `server/` instead of `backend/` |

---

## 2. Server prerequisites (one-time)

Run on **151.50.1.38** as Administrator.

### 2.1 Install software

| Software | Version | Verify |
|----------|---------|--------|
| **Node.js** | **22.x LTS** (64-bit) | `node -v` â†’ `v22.x.x` |
| **PM2** | 5.x | `pm2 -v` |
| **Google Chrome** | Latest 64-bit | For PDF; do **not** rely on Edge |
| **IIS** | Windows Server feature | Server Manager â†’ Web Server (IIS) |
| **URL Rewrite** | 2.1 | [Download](https://www.iis.net/downloads/microsoft/url-rewrite) |
| **ARR** | 3.0 | Application Request Routing |

```powershell
# Install PM2 globally (after Node 22)
npm install -g pm2
```

### 2.2 IIS modules

1. Open **IIS Manager**
2. Click the **server node** (not a site)
3. Open **Application Request Routing Cache**
4. Click **Server Proxy Settings** â†’ check **Enable proxy** â†’ Apply

### 2.3 ARR proxy timeout (critical for PDF)

Large quote PDFs can take 60â€“180 seconds. Default ARR timeout (~120s) causes 502 errors.

```powershell
# Run in elevated PowerShell on the server
Import-Module WebAdministration
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' `
    -Filter 'system.webServer/proxy' -Name 'timeout' -Value '00:03:00'
```

Or use the included script: `helpers\configure_arr.ps1`

### 2.4 Firewall

- Allow inbound **TCP 81** (EMS website)
- API port **5002** stays **localhost only** (not exposed externally)
- Ensure server can reach **151.50.1.116** (SQL) and **\\151.50.20.129** (UNC)

---

## 3. Directory layout (permanent standard)

All deployments use this structure on the server:

```
C:\inetpub\wwwroot\EMS\
â”œâ”€â”€ frontend\              â† IIS physical path (React build + web.config)
â”‚   â”œâ”€â”€ index.html
â”‚   â”œâ”€â”€ assets\
â”‚   â””â”€â”€ web.config         â† proxies /api and /uploads to :5002
â”œâ”€â”€ backend\               â† Node.js Express API
â”‚   â”œâ”€â”€ index.js
â”‚   â”œâ”€â”€ .env               â† production secrets (NEVER in deploy zip)
â”‚   â”œâ”€â”€ package.json
â”‚   â”œâ”€â”€ uploads\           â† logos for PDF/UI
â”‚   â””â”€â”€ temp\              â† Puppeteer temp (created at runtime)
â”œâ”€â”€ helpers\               â† batch files + Outlook helper
â”œâ”€â”€ logs\                  â† PM2 stdout/stderr
â”œâ”€â”€ ecosystem.config.cjs   â† PM2 definition
â”œâ”€â”€ DEPLOYMENT_GUIDE.md
â”œâ”€â”€ IIS_ENTERPRISE_DEPLOYMENT_GUIDE.md
â””â”€â”€ PACKAGE_MANIFEST.json
```

**Rule:** IIS serves `frontend\` only. PM2 runs from site root `C:\inetpub\wwwroot\EMS\`.

---

## 4. Phase 1 â€” Deploy package to server

### 4.1 Build package (development machine)

```powershell
cd "D:\Data\EMS Online\EMS"
node -v    # must be v22.x
node create_deploy_package.cjs
```

Output: `EMS_Deploy_YYYY-MM-DD\`

### 4.2 Copy to server

Copy the **entire** deploy folder contents to `C:\inetpub\wwwroot\EMS\`.

**Preserve on redeploy:**
- `backend\.env` (production secrets)
- `backend\uploads\` (merge; do not delete server-only files)
- `logs\` (optional)

**Replace on redeploy:**
- `frontend\` (full replace)
- `backend\` source files (except `.env` and `uploads\`)
- `helpers\`, `ecosystem.config.cjs`

Or run `helpers\redeploy.bat` after copying.

---

## 5. Phase 2 â€” Backend configuration

### 5.1 Create production `.env`

```powershell
cd C:\inetpub\wwwroot\EMS\backend
copy .env.production.example .env
notepad .env
```

### 5.2 Required values for 151.50.1.38

```env
# Database
DB_SERVER=151.50.1.116
DB_DATABASE=EMS_DB
DB_USER=<your_sql_user>
DB_PASSWORD=<your_sql_password>

PORT=5002

# SMTP (enquiry notifications on server)
SMTP_HOST=almoayyedcg-com.mail.protection.outlook.com
SMTP_PORT=25
SMTP_USER=ems@almoayyedcg.com
SMTP_PASS=<smtp_password>
SMTP_ENCRYPTION=STARTTLS
SMTP_IPV4=1

# File storage
ENQUIRY_ATTACHMENTS_ROOT=\\151.50.20.129\ems app

# Enquiry: server SMTP (Outlook COM does not work under PM2)
EMS_ENQUIRY_NOTIFY_VIA_SMTP=1
EMS_ENQUIRY_NOTIFY_SMTP_FALLBACK=1

# Quote PDF â€” MUST be enabled for server PDF = local behavior
EMS_QUOTE_PDF_SERVER_ENABLED=1
QUOTE_PDF_ASSET_ORIGIN=http://127.0.0.1:5002
QUOTE_PDF_USE_FILE_LOAD=1
PUPPETEER_LAUNCH_TIMEOUT_MS=120000
QUOTE_PDF_PAGE_TIMEOUT_MS=180000

# IMPORTANT: Use Puppeteer Chrome, NOT Edge
# Leave PUPPETEER_EXECUTABLE_PATH unset after running:
#   npx puppeteer browsers install chrome
# Or set explicitly:
# PUPPETEER_EXECUTABLE_PATH=C:\Users\<pm2-user>\.cache\puppeteer\chrome\...\chrome.exe

EMS_QUOTE_PDF_PERF_LOG=1
```

**Do not set** `PUPPETEER_EXECUTABLE_PATH` to Edge (`msedge.exe`) â€” pagination will differ from local.

### 5.3 Install Node dependencies (on server)

```powershell
cd C:\inetpub\wwwroot\EMS\backend
node -v                    # v22.x required
npm ci --omit=dev
npx puppeteer browsers install chrome
```

Or double-click `helpers\install_dependencies.bat`.

**Never copy `node_modules` from another PC** â€” native modules (`muhammara`, `puppeteer`) must compile on the server.

### 5.4 Permissions

Grant the **PM2 service account** (the Windows user running PM2):

| Path | Permission |
|------|------------|
| `C:\inetpub\wwwroot\EMS\backend\uploads` | Modify |
| `C:\inetpub\wwwroot\EMS\backend\temp` | Modify |
| `C:\inetpub\wwwroot\EMS\logs` | Modify |
| `%TEMP%` | Modify (Puppeteer user-data) |
| `\\151.50.20.129\ems app` | Modify |

Grant **IIS_IUSRS** / **IUSR**: Read on `frontend\` only.

---

## 6. Phase 3 â€” PM2 API service

### 6.1 Start API

```powershell
cd C:\inetpub\wwwroot\EMS
mkdir logs 2>$null
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # follow printed command to survive reboot
```

Or run `helpers\start_api_pm2.bat`.

### 6.2 Verify PDF health

```powershell
curl "http://localhost:5002/api/quote-pdf/health?launch=1"
```

Expected JSON:

| Field | Expected |
|-------|----------|
| `ok` | `true` |
| `emsQuotePdfServerEnabled` | `true` |
| `chromeReady` | `true` |
| `chromeEngine` | `chrome` (not `edge`) |
| `quotePdfCssVersion` | current build version |

If `chromeReady: false`, run `npx puppeteer browsers install chrome` **as the same user that runs PM2**.

### 6.3 PM2 service account recommendation

For Puppeteer stability, run PM2 under a **dedicated local/domain service account** (not `LocalSystem`):

1. Create user e.g. `EMS-SVC` with "Log on as a service" right
2. Log in once as that user (or use `runas`) and run `npx puppeteer browsers install chrome`
3. Configure PM2 startup for that user

---

## 7. Phase 4 â€” IIS site configuration

### 7.1 Create application pool

| Setting | Value |
|---------|-------|
| Name | `EMS-Web` |
| .NET CLR version | **No Managed Code** |
| Managed pipeline mode | Integrated |
| Identity | ApplicationPoolIdentity (default) |
| Start Mode | AlwaysRunning (optional) |

### 7.2 Create website

| Setting | Value |
|---------|-------|
| Site name | `EMS` |
| Physical path | `C:\inetpub\wwwroot\EMS\frontend` |
| Binding | `http`, IP `151.50.1.38` (or All Unassigned), Port **81** |
| Application pool | `EMS-Web` |

Or run: `helpers\setup_iis_site_port81.ps1`

### 7.3 Verify web.config rules

`frontend\web.config` must contain three rewrite rules:

1. **API Proxy** â€” `^api/(.*)` â†’ `http://localhost:5002/api/{R:1}`
2. **Uploads Proxy** â€” `^uploads/(.*)` â†’ `http://localhost:5002/uploads/{R:1}` (required for logos)
3. **React Routes** â€” SPA fallback to `index.html`

### 7.4 Test from server

```powershell
curl http://localhost:81/
curl http://localhost:81/api/quote-pdf/health
curl http://151.50.1.38/
```

---

## 8. Phase 5 â€” Outlook on user PCs

**Server-side `/api/quotes/outlook-draft` will not work on IIS.** This is by design â€” Outlook COM requires an interactive desktop session.

### 8.1 Per-user setup (required for Quote Email)

Each estimator needs on their **Windows PC**:

1. **Node.js 22** installed
2. **Classic Outlook** (not "New Outlook")
3. EMS Outlook helper running at login

**Option A â€” Network share (recommended for enterprise)**

Map or access `\\151.50.1.38\EMS$` (or copy `helpers\` + `backend\lib\` subset locally).

Create a desktop shortcut or GPO logon script:

```batch
@echo off
cd /d "\\151.50.1.38\EMS\helpers"
start /min node quote-outlook-local-helper.cjs
```

**Option B â€” Local copy**

Copy `helpers\` folder to `C:\EMS\helpers\` on each PC. Ensure `C:\EMS\backend\` exists (full backend or at minimum `lib\` + `dbConfig.js` + `.env` for enquiry drafts).

Run `helpers\install_on_user_pc.bat` (included in package).

### 8.2 Verify helper

On user PC:

```powershell
curl http://127.0.0.1:39281/health
```

Expected: `{"ok":true,"service":"ems-outlook-local-helper"}`

### 8.3 User workflow

1. User opens `http://151.50.1.38`
2. Opens a quote â†’ clicks **Email**
3. Browser calls `http://127.0.0.1:39281/outlook-draft` on the user's PC
4. Helper generates PDF attachment and opens Outlook draft via COM

---

## 9. Phase 6 â€” Smoke tests

| # | Test | URL / Action | Expected |
|---|------|--------------|----------|
| 1 | UI loads | `http://151.50.1.38` | Login page / dashboard |
| 2 | API via IIS | `http://151.50.1.38/api/quote-pdf/health` | JSON with `ok: true` |
| 3 | Logos | Open any quote with division logo | Logo visible |
| 4 | Enquiry list | Navigate to enquiries | Data loads from SQL |
| 5 | PDF download | Quote â†’ Download PDF | PDF downloads, correct page count |
| 6 | PDF via IIS | Same test through `:81` (not direct `:5002`) | Same result |
| 7 | Quote email | With helper running on PC | Outlook draft opens with PDF |
| 8 | PM2 logs | `pm2 logs EMS-API --lines 50` | `[quote-pdf][perf]` on PDF download |

---

## 10. Future redeployments (development workflow)

### Standard redeploy (code update)

```powershell
# On dev machine
cd "D:\Data\EMS Online\EMS"
node create_deploy_package.cjs

# Copy EMS_Deploy_YYYY-MM-DD to server (preserve backend\.env and uploads)

# On server
cd C:\inetpub\wwwroot\EMS
helpers\redeploy.bat
```

`redeploy.bat` runs: `npm ci` â†’ Puppeteer Chrome check â†’ `pm2 restart EMS-API --update-env`

### Frontend-only redeploy

```powershell
node build_frontend_deploy.cjs
# Copy frontend\ to server, IIS picks up immediately (no PM2 restart needed)
```

### Rollback

1. `pm2 stop EMS-API`
2. Restore previous `frontend\` + `backend\` from backup
3. `pm2 restart EMS-API --update-env`

Keep dated backups: `C:\inetpub\wwwroot\EMS_backup_YYYY-MM-DD\`

---

## 11. Troubleshooting reference

| Symptom | Cause | Fix |
|---------|-------|-----|
| PDF 502 / timeout via `:81` | ARR proxy timeout | Set proxy timeout to 180s (`configure_arr.ps1`) |
| PDF 500 `chrome_not_configured` | Chrome not installed for PM2 user | `npx puppeteer browsers install chrome` as PM2 user |
| PDF blank pages | Browser print mode enabled | Rebuild with `VITE_QUOTE_PDF_BROWSER_DOWNLOAD=0` |
| PDF layout differs from local | Edge used instead of Chrome | Unset Edge path; use Puppeteer Chrome |
| `emsQuotePdfServerEnabled: false` | `.env` flag off | Set `EMS_QUOTE_PDF_SERVER_ENABLED=1`, restart PM2 |
| Logos missing on IIS | No uploads proxy rule | Verify `web.config` Uploads Proxy rule |
| API 502 | PM2 not running | `pm2 status`, `pm2 start ecosystem.config.cjs` |
| Outlook does not open | Helper not on user PC | Start helper; use classic Outlook |
| Helper "backend not found" | Wrong folder layout | Run from `helpers\` with `backend\` sibling |
| `muhammara` NODE_MODULE_VERSION | Node 24 installed | Use Node 22; or `QUOTE_PDF_RESTRICT=0` |
| UNC upload fails | PM2 user lacks share access | Grant Modify on `\\151.50.20.129\ems app` |
| SQL connection fails | Firewall / credentials | Test `telnet 151.50.1.116 1433` |

---

## 12. Enterprise checklist (printable)

```
â–¡ Node.js 22 LTS on server
â–¡ PM2 installed globally
â–¡ IIS + URL Rewrite + ARR installed
â–¡ ARR proxy enabled, timeout 180s
â–¡ Package copied to C:\inetpub\wwwroot\EMS\
â–¡ backend\.env configured (DB, SMTP, PDF flags)
â–¡ npm ci --omit=dev + puppeteer chrome install
â–¡ PM2 running EMS-API, pm2 save + startup
â–¡ PDF health check passes (chromeEngine: chrome)
â–¡ IIS site EMS on port 81 â†’ frontend\
â–¡ Firewall allows TCP 81
â–¡ PM2 user has Modify on uploads, temp, UNC
â–¡ Outlook helper deployed to each user PC
â–¡ Smoke tests 1â€“8 pass
```

---

*Package baseline: see `PACKAGE_MANIFEST.json` and `PRODUCTION_DEPLOYMENT_BASELINE.md`.*

