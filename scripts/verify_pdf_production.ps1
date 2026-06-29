# Run on the Windows Server (or from a PC that can reach :81).
# Confirms backend PDF fix is live and whether Puppeteer/Chrome can launch.
param(
    [string]$BaseUrl = 'http://151.50.1.114:81'
)

$ErrorActionPreference = 'Stop'
$healthUrl = "$BaseUrl/api/quote-pdf/health?launch=1"

Write-Host "=== EMS Quote PDF production check ===" -ForegroundColor Cyan
Write-Host "URL: $healthUrl`n"

try {
    $resp = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 120
} catch {
    Write-Host "FAIL: Could not reach health endpoint." -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

$css = $resp.quotePdfCssVersion
$expected = '2026-06-05-footer-auto'
if ($css -eq $expected) {
    Write-Host "OK  quotePdfCssVersion = $css" -ForegroundColor Green
} else {
    Write-Host "FAIL quotePdfCssVersion = '$css' (expected '$expected')" -ForegroundColor Red
    Write-Host "     -> Copy backend\routes\quotePdf.js + backend\lib\quotePrintExportCss.cjs and run: pm2 restart EMS-API --update-env"
}

$launchOk = $resp.launchProbe.ok
$spawnOk = $resp.chromeSpawnProbe.ok
if ($launchOk -and $spawnOk) {
    Write-Host "OK  Puppeteer Chrome launch + spawn probe" -ForegroundColor Green
} else {
    Write-Host "FAIL Puppeteer/Chrome on server (PDF will fall back to browser html2pdf — footer/layout differ)" -ForegroundColor Red
    Write-Host "     launchProbe.ok = $launchOk"
    Write-Host "     chromeSpawnProbe.ok = $spawnOk"
    if ($resp.chromeSpawnProbe.message) { Write-Host "     $($resp.chromeSpawnProbe.message)" }
    Write-Host "     -> Run helpers\fix_puppeteer_pdf_ws2012.bat as the same user as PM2 EMS-API"
}

$backendRoot = 'C:\inetpub\wwwroot\EMS\backend'
$frontendRoot = 'C:\inetpub\wwwroot\EMS\frontend'
if (Test-Path $backendRoot) {
    $cjs = Join-Path $backendRoot 'lib\quotePrintExportCss.cjs'
    if (Test-Path $cjs) {
        $text = Get-Content $cjs -Raw
        if ($text -match 'margin-top:\s*auto') {
            Write-Host "OK  backend quotePrintExportCss.cjs contains margin-top: auto" -ForegroundColor Green
        } else {
            Write-Host "FAIL backend quotePrintExportCss.cjs missing footer pin (margin-top: auto)" -ForegroundColor Red
        }
    } else {
        Write-Host "WARN backend quotePrintExportCss.cjs not found at $cjs" -ForegroundColor Yellow
    }
}

if (Test-Path $frontendRoot) {
    $index = Join-Path $frontendRoot 'index.html'
    if (Test-Path $index) {
        $html = Get-Content $index -Raw
        if ($html -match 'assets/index-([a-zA-Z0-9]+)\.js') {
            $hash = $Matches[1]
            $jsPath = Join-Path $frontendRoot "assets\index-$hash.js"
            if (Test-Path $jsPath) {
                $bundle = Get-Content $jsPath -Raw
                if ($bundle -match 'margin-top:\s*auto\s*!important') {
                    Write-Host "OK  frontend bundle index-$hash.js includes footer pin CSS" -ForegroundColor Green
                } else {
                    Write-Host "FAIL frontend bundle is OLD — rebuild (npm run build) and copy dist\* to frontend\" -ForegroundColor Red
                }
                if ($bundle -match '_\$\{Date\.now\(\)\}\.pdf') {
                    Write-Host "OK  frontend email uses unique PDF attachment names" -ForegroundColor Green
                } else {
                    Write-Host "WARN frontend may use old email attachment naming — rebuild and redeploy dist\" -ForegroundColor Yellow
                }
            }
        }
    }
}

Write-Host "`nIn browser DevTools (F12) when clicking Download PDF:" -ForegroundColor Cyan
Write-Host "  - Good: [QuotePerf] PDF Download complete (no 'server PDF failed, trying client html2pdf')"
Write-Host "  - Bad:  [downloadPDF] server PDF failed -> html2pdf fallback (fix Chrome 109 on server first)"
Write-Host "`nAfter frontend deploy: hard refresh Ctrl+Shift+R or clear site cache."
