# Quote PDF on Windows Server 2012 R2

**OS constraint:** Windows Server 2012 R2 cannot run Chrome 110+ or Puppeteer’s default Chrome 146.

**Important:** `npx @puppeteer/browsers install chrome@109` **always fails with 404** — Chrome-for-Testing (CfT) only exists from Chrome **115** onward. Chrome 109 was never in that bucket.

---

## Correct versions

| Item | Value |
|------|--------|
| **Last Google Chrome for this OS** | **109.0.5414.120** (stable) |
| **Matching Chromium snapshot** | Revision **1069273** (Chromium 109.0.5412) — used by Puppeteer 19.4 |
| **Puppeteer on server** | **`puppeteer@19.4.0`** (not 19.11 — that targets Chrome 110+) |
| **Dev machines (Win10+)** | Keep `puppeteer@24` in source repo |

---

## Direct downloads (use on the server)

### Option A — Chromium portable ZIP (recommended for Puppeteer)

**URL (try in order):**

1. https://storage.googleapis.com/chromium-browser-snapshots/Win_x64/1069273/chrome-win.zip  
2. https://commondatastorage.googleapis.com/chromium-browser-snapshots/Win_x64/1069273/chrome-win.zip  

**Extract to:**

```
C:\inetpub\wwwroot\EMS\backend\.cache\chromium-chrome109\chrome-win-1069273\chrome-win\chrome.exe
```

**Verify:**

```powershell
& "C:\inetpub\wwwroot\EMS\backend\.cache\chromium-chrome109\chrome-win-1069273\chrome-win\chrome.exe" --version
```

Expected: `Chromium` or `Chrome` **109.x**.

### Option B — Google Chrome 109.0.5414.120 offline installer (64-bit)

**URL (try in order):**

1. https://edgedl.me.gvt1.com/edgedl/release2/chrome/czao2hrvpk5wgqrkz4kks5r734_109.0.5414.120/109.0.5414.120_chrome_installer.exe  
2. https://dl.google.com/release2/chrome/czao2hrvpk5wgqrkz4kks5r734_109.0.5414.120/109.0.5414.120_chrome_installer.exe  

**Silent install:**

```powershell
.\109.0.5414.120_chrome_installer.exe /silent /install
```

**Path after install:**

```
C:\Program Files\Google\Chrome\Application\chrome.exe
```

### Option C — Internet Archive MSI (if Google URLs fail)

Download: https://archive.org/download/chrome-109-Win7-8/Chrome%20109%20x64.msi  

```powershell
msiexec /i "Chrome 109 x64.msi" /qn
```

Verify SHA/size from archive.org before use in production.

---

## Automated install (recommended)

Copy to server:

- `helpers\fix_puppeteer_pdf_ws2012.bat`
- `helpers\install_chrome109_ws2012.ps1`

Run **as the PM2 user**:

```powershell
cd C:\inetpub\wwwroot\EMS\helpers
.\fix_puppeteer_pdf_ws2012.bat
```

The script:

1. Removes Chrome 146 cache  
2. `npm ci` + `puppeteer@19.4.0`  
3. Downloads Chromium ZIP **or** Chrome 109 installer  
4. Writes `backend\chrome109.env.snippet`  
5. Verifies spawn + restarts PM2  

---

## Manual server setup

```powershell
cd C:\inetpub\wwwroot\EMS\backend
Remove-Item -Recurse -Force .cache\puppeteer -ErrorAction SilentlyContinue

npm ci --omit=dev
npm install puppeteer@19.4.0 --save-exact --omit=dev

# Download chrome-win.zip (Option A) and extract, OR run offline installer (Option B)
```

**`backend\.env`:**

```env
EMS_QUOTE_PDF_SERVER_ENABLED=1
QUOTE_PDF_ASSET_ORIGIN=http://127.0.0.1:5002
QUOTE_PDF_SINGLE_PROCESS=0
PUPPETEER_CHROME_MILESTONE=109

# Portable Chromium (Option A):
PUPPETEER_EXECUTABLE_PATH=C:\inetpub\wwwroot\EMS\backend\.cache\chromium-chrome109\chrome-win-1069273\chrome-win\chrome.exe

# OR installed Chrome (Option B):
# PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

```powershell
cd C:\inetpub\wwwroot\EMS
pm2 restart EMS-API --update-env
curl "http://localhost:5002/api/quote-pdf/health?launch=1"
```

Required: `chromeSpawnProbe.ok: true`, `launchProbe.ok: true`, path contains `109` or revision folder `1069273`.

---

## What we tested / aligned builds

| Build | Revision / version | Puppeteer | OS |
|-------|-------------------|-----------|-----|
| Chromium snapshot | **1069273** (109.0.5412) | **19.4.0** | Win Server 2012 R2 |
| Google Chrome stable | **109.0.5414.120** | **19.4.0** | Win7/8/8.1/2012 R2 |

We do **not** host a custom ZIP in the EMS repo — use the Google/archive URLs above (same binaries Puppeteer 19.4 originally downloaded).

---

## Do NOT use

| Command / path | Why |
|----------------|-----|
| `npx @puppeteer/browsers install chrome@109` | CfT 404 — milestone 109 not published |
| `npx puppeteer browsers install chrome` | Installs Chrome 146 |
| Copy `.cache\puppeteer` from dev PC | EFTYPE / wrong OS |
| `puppeteer@19.11.1` on 2012 R2 | Targets Chrome 110+ |

---

## Fallback without server PDF

```env
# Frontend .env.production — rebuild frontend only
VITE_QUOTE_PDF_BROWSER_DOWNLOAD=1
```

Users: Download PDF → Print → Save as PDF.

---

## Long-term

Upgrade to **Windows Server 2016+** to use standard `puppeteer@24` + current Chrome.
