# EMS Production Deployment Baseline

Permanent reference for IIS + PM2 deployments. Package builds must follow this document.

**Baseline version:** 2026-06-05  
**PDF CSS profile:** `2026-06-04-continuation-fit`

---

## A. Supported environment

| Component | Required | Notes |
|-----------|----------|--------|
| **Node.js** | **22.x LTS** (e.g. 22.22.0) | **Officially supported.** Build and run use the same major. |
| **Node.js 24** | **Not supported** | Native `muhammara` ABI mismatch (`NODE_MODULE_VERSION 127` vs `137`). |
| **Node.js 20** | Not tested for current stack | Use 22 LTS. |
| **npm** | **10+** (lockfile v3; tested with **11.6.x**) | Use **`npm ci --omit=dev`** on the server. |
| **PM2** | 5.x recommended | `npm install -g pm2` |
| **OS** | Windows Server 2019+ | IIS + ARR proxy |
| **SQL Server** | Reachable from API host | `mssql` / optional `msnodesqlv8` |
| **Chrome** | For quote PDF | Puppeteer-managed Chrome preferred |

**Do not copy `node_modules` from the build PC to production.** Native modules (`muhammara`, `puppeteer`) must be compiled on the server with Node 22.

---

## B. Deployment package

### Layout

```
EMS_Deploy_YYYY-MM-DD/
  frontend/              # Vite production build + web.config
  frontend/dist/         # Same assets (legacy IIS paths)
  backend/               # Express API source (no node_modules by default)
  backend/package.json
  backend/package-lock.json
  backend/.nvmrc         # 22
  backend/.env.production.example
  backend/uploads/       # Logos + dev uploads (see UPLOADS_MANIFEST.json)
  helpers/               # install_dependencies.bat, PM2, Outlook helper
  ecosystem.config.cjs   # PM2 app definition
  web.config             # Root rewrite reference
  DEPLOYMENT_GUIDE.md
  PRODUCTION_DEPLOYMENT_BASELINE.md
  PACKAGE_MANIFEST.json
```

### Install dependencies on server (required)

```powershell
cd C:\inetpub\wwwroot\EMS\backend
node -v    # must show v22.x.x
npm ci --omit=dev
npx puppeteer browsers install chrome
```

Use **`npm ci`**, not `npm install`, when `package-lock.json` is present.

Optional package build flag `--with-node-modules` pre-installs on the build machine for smoke tests only; production should still run `npm ci` on the server.

---

## C. PDF engine verification

### Required `.env`

```env
EMS_QUOTE_PDF_SERVER_ENABLED=1
```

If this is `0` or missing, health returns `emsQuotePdfServerEnabled: false` and the UI may fall back to browser print (different pagination).

### Health check

```http
GET http://localhost:5002/api/quote-pdf/health?launch=1
```

| Field | Expected (production) |
|-------|------------------------|
| `ok` | `true` |
| `puppeteer` | `true` |
| `chromeReady` | `true` |
| `emsQuotePdfServerEnabled` | **`true`** |
| `quotePdfCssVersion` | **`2026-06-04-continuation-fit`** |
| `chromeEngine` | **`chrome`** (not `edge`) |
| `chromePath` | Path to `chrome.exe` |
| `emsQuotePdfPerfLog` | `true` when `EMS_QUOTE_PDF_PERF_LOG=1` |

### Pagination parity

- Pagination is computed in the **browser**; the server **prints** pre-built HTML sheets.
- Local and server PDFs match when: same frontend bundle, `EMS_QUOTE_PDF_SERVER_ENABLED=1`, **Chrome** (not Edge), and continuation-sheet CSS profile above.
- Client perf logs: `?emsQuotePerf=1` in the EMS URL.
- Server logs: PM2 stdout `[quote-pdf][perf]` and `[quote-pdf][pagination]`.

---

## D. Browser / rendering

| Option | Recommendation |
|--------|----------------|
| **Puppeteer bundled Chrome** | **Preferred** — `npx puppeteer browsers install chrome` |
| **Google Chrome** | OK — set `PUPPETEER_EXECUTABLE_PATH` |
| **Microsoft Edge** | Not recommended — layout differs from local dev |

```env
# Leave unset to use puppeteer.executablePath(), or:
PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

Unset `PUPPETEER_EXECUTABLE_PATH` if it points to Edge.

---

## E. PM2 configuration

### Official start (from site root)

```powershell
cd C:\inetpub\wwwroot\EMS
mkdir logs 2>nul
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### Restart after deploy

```powershell
pm2 restart EMS-API --update-env
pm2 logs EMS-API --lines 100
```

### Do not use

- `node --watch index.js` (dev only)
- `pm2 start index.js` without `--update-env` after `.env` changes

---

## F. IIS configuration

| Item | Setting |
|------|---------|
| Site physical path | `...\EMS\frontend` |
| ARR proxy | **Enabled** at server level |
| URL Rewrite | From `frontend\web.config` |
| API proxy target | `http://localhost:5002/api/{path}` |
| **Uploads proxy** | **`/uploads/*` → `http://localhost:5002/uploads/*`** (required for quote logos in UI) |
| App pool | No Node required in IIS; static + proxy only |
| Modules | URL Rewrite, Application Request Routing |

Increase ARR `proxyTimeout` (e.g. 180s) for large quote PDFs.

Without the **Uploads Proxy** rule, logos show locally (Vite proxies `/uploads`) but not on IIS.

---

## G. Environment variables

Copy `backend\.env.production.example` → `backend\.env`. See that file for the full template.

Critical PDF flags:

```env
EMS_QUOTE_PDF_SERVER_ENABLED=1
EMS_QUOTE_PDF_PERF_LOG=1
EMS_QUOTE_PDF_DEBUG_PAGINATION=1
QUOTE_PDF_ASSET_ORIGIN=http://127.0.0.1:5002
```

If `muhammara` fails on Node 22 after `npm ci`, set temporarily:

```env
QUOTE_PDF_RESTRICT=0
```

---

## H. Long-term stability — muhammara

- **Used for:** optional PDF copy/print restrictions (`restrictQuotePdf.js`), not for generating quote layout.
- **Quote PDF generation:** Puppeteer only.
- **Node 24:** breaks native `muhammara@6.0.4` — stay on **Node 22 LTS**.
- **Future:** consider replacing `muhammara` with `pdf-lib` or server-side qpdf; not required for pagination parity.

If restriction is not required, `QUOTE_PDF_RESTRICT=0` avoids `muhammara` entirely.

---

## Deployment checklist

1. Install **Node 22 LTS** (64-bit) on API server.
2. Copy deploy package; preserve or merge `backend\.env` and production `uploads`.
3. `cd backend` → `npm ci --omit=dev` → `npx puppeteer browsers install chrome`.
4. Configure `.env` (`EMS_QUOTE_PDF_SERVER_ENABLED=1`, DB, SMTP, Chrome path).
5. `pm2 start ecosystem.config.cjs` from site root → `pm2 save`.
6. IIS site → `frontend`, ARR enabled.
7. Health check + download same quote as local; compare page count.
8. PM2 logs show `[quote-pdf][perf]` and `[quote-pdf][pagination]`.

---

## Build a fresh package (dev machine)

```powershell
cd D:\Data\EMS Online\EMS
node -v   # must be v22.x
node create_deploy_package.cjs
```

Output: `EMS_Deploy_YYYY-MM-DD\`
