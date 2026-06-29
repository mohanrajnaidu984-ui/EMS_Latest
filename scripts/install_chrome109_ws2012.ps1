# Install Chrome/Chromium 109 for EMS Puppeteer on Windows Server 2012 R2.
# Chrome-for-Testing (npx @puppeteer/browsers chrome@109) returns 404 — CfT starts at Chrome 115.
# Run as the PM2 user from: C:\inetpub\wwwroot\EMS\backend
param(
    [string]$BackendRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path (Join-Path $BackendRoot 'package.json'))) {
    if (Test-Path (Join-Path (Split-Path $BackendRoot) 'backend\package.json')) {
        $BackendRoot = Join-Path (Split-Path $BackendRoot) 'backend'
    } else {
        throw "backend package.json not found under $BackendRoot"
    }
}

Write-Host "=== EMS Chrome 109 installer (Windows Server 2012 R2) ==="
Write-Host "Backend: $BackendRoot"
Write-Host "User:    $env:USERDOMAIN\$env:USERNAME"
Write-Host ""

$cacheRoot = Join-Path $BackendRoot '.cache'
$portableDir = Join-Path $cacheRoot 'chromium-chrome109'
$downloadDir = Join-Path $cacheRoot 'downloads'
New-Item -ItemType Directory -Force -Path $portableDir, $downloadDir | Out-Null

function Test-ChromeExe([string]$ExePath) {
    if (-not (Test-Path $ExePath)) { return $false }
    $len = (Get-Item $ExePath).Length
    if ($len -lt 500000) {
        Write-Warning "chrome.exe too small ($len bytes): $ExePath"
        return $false
    }
    try {
        $p = Start-Process -FilePath $ExePath -ArgumentList '--version' -Wait -PassThru -WindowStyle Hidden
        return $p.ExitCode -eq 0
    } catch {
        Write-Warning "Spawn failed: $($_.Exception.Message)"
        return $false
    }
}

function Expand-Zip([string]$ZipPath, [string]$Dest) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $Dest)
}

function Try-Download([string[]]$Urls, [string]$OutFile) {
    foreach ($url in $Urls) {
        Write-Host "Downloading: $url"
        try {
            if (Get-Command Invoke-WebRequest -ErrorAction SilentlyContinue) {
                Invoke-WebRequest -Uri $url -OutFile $OutFile -UseBasicParsing -TimeoutSec 600
            } else {
                $wc = New-Object System.Net.WebClient
                $wc.DownloadFile($url, $OutFile)
            }
            if ((Get-Item $OutFile).Length -gt 1000000) {
                Write-Host "OK: $OutFile"
                return $true
            }
            Write-Warning "File too small, trying next URL..."
        } catch {
            Write-Warning "Failed: $($_.Exception.Message)"
        }
    }
    return $false
}

$chromeExe = $null

# --- Method 1: Puppeteer 19.4 Chromium snapshot (revision 1069273 = Chromium 109.0.5412) ---
$zipPath = Join-Path $downloadDir 'chrome-win-1069273.zip'
$zipUrls = @(
    'https://storage.googleapis.com/chromium-browser-snapshots/Win_x64/1069273/chrome-win.zip',
    'https://commondatastorage.googleapis.com/chromium-browser-snapshots/Win_x64/1069273/chrome-win.zip'
)
if (Try-Download $zipUrls $zipPath) {
    $extractTo = Join-Path $portableDir 'chrome-win-1069273'
    if (Test-Path $extractTo) { Remove-Item -Recurse -Force $extractTo }
    New-Item -ItemType Directory -Force -Path $extractTo | Out-Null
    Expand-Zip $zipPath $extractTo
    $candidate = Join-Path $extractTo 'chrome-win\chrome.exe'
    if (Test-ChromeExe $candidate) {
        $chromeExe = $candidate
        Write-Host "SUCCESS: Chromium portable at $chromeExe"
    }
}

# --- Method 2: Google Chrome 109.0.5414.120 stable offline installer (last build for Win8.1 / Server 2012 R2) ---
if (-not $chromeExe) {
    $installerPath = Join-Path $downloadDir '109.0.5414.120_chrome_installer.exe'
    $installerUrls = @(
        'https://edgedl.me.gvt1.com/edgedl/release2/chrome/czao2hrvpk5wgqrkz4kks5r734_109.0.5414.120/109.0.5414.120_chrome_installer.exe',
        'https://dl.google.com/release2/chrome/czao2hrvpk5wgqrkz4kks5r734_109.0.5414.120/109.0.5414.120_chrome_installer.exe',
        'https://www.google.com/dl/release2/chrome/czao2hrvpk5wgqrkz4kks5r734_109.0.5414.120/109.0.5414.120_chrome_installer.exe'
    )
    if (Try-Download $installerUrls $installerPath) {
        Write-Host "Running Chrome 109 installer (per-machine)..."
        $proc = Start-Process -FilePath $installerPath -ArgumentList '/silent', '/install' -Wait -PassThru
        Write-Host "Installer exit code: $($proc.ExitCode)"
        Start-Sleep -Seconds 5
        $installed = @(
            "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
        )
        foreach ($c in $installed) {
            if (Test-ChromeExe $c) {
                $chromeExe = $c
                Write-Host "SUCCESS: Installed Chrome at $chromeExe"
                break
            }
        }
    }
}

# --- Method 3: Internet Archive MSI (manual fallback documented in WINDOWS_SERVER_2012_R2_PDF.md) ---
if (-not $chromeExe) {
    Write-Host ""
    Write-Host "Automatic download failed. Manual options:"
    Write-Host "  1. Download Chromium zip:"
    Write-Host "     https://storage.googleapis.com/chromium-browser-snapshots/Win_x64/1069273/chrome-win.zip"
    Write-Host "     Extract to: $portableDir\chrome-win-1069273\chrome-win\chrome.exe"
    Write-Host "  2. Download Chrome 109 offline installer (64-bit):"
    Write-Host "     https://edgedl.me.gvt1.com/edgedl/release2/chrome/czao2hrvpk5wgqrkz4kks5r734_109.0.5414.120/109.0.5414.120_chrome_installer.exe"
    Write-Host "  3. Internet Archive MSI:"
    Write-Host "     https://archive.org/download/chrome-109-Win7-8/Chrome%20109%20x64.msi"
    Write-Host "     msiexec /i `"Chrome 109 x64.msi`" /qn"
    throw "Could not install Chrome 109 automatically."
}

$envSnippet = @"
# Chrome 109 for Windows Server 2012 R2 (auto-generated $(Get-Date -Format 'yyyy-MM-dd HH:mm'))
PUPPETEER_EXECUTABLE_PATH=$chromeExe
PUPPETEER_CHROME_MILESTONE=109
QUOTE_PDF_SINGLE_PROCESS=0
PUPPETEER_LAUNCH_TIMEOUT_MS=180000
QUOTE_PDF_PAGE_TIMEOUT_MS=180000
"@

$snippetPath = Join-Path $BackendRoot 'chrome109.env.snippet'
Set-Content -Path $snippetPath -Value $envSnippet -Encoding ASCII
Write-Host ""
Write-Host "Add these lines to backend\.env (saved to chrome109.env.snippet):"
Write-Host $envSnippet
Write-Host ""
Write-Host "Next: pm2 restart EMS-API --update-env"
Write-Host "Test:  curl http://localhost:5002/api/quote-pdf/health?launch=1"
