@echo off
title EMS Puppeteer PDF - Windows Server 2012 R2
echo === EMS PDF fix for Windows Server 2012 R2 ===
echo.
echo Chrome 146 cannot run on this OS. Use Chrome 109 only.
echo NOTE: npx @puppeteer/browsers install chrome@109 returns 404
echo       (Chrome-for-Testing starts at Chrome 115).
echo.
echo Windows user: %USERDOMAIN%\%USERNAME%
echo Run as the account that owns PM2.
echo.
cd /d "%~dp0"
if exist "..\server\package.json" (
  cd /d "%~dp0..\server"
) else if exist "..\backend\package.json" (
  cd /d "%~dp0..\backend"
) else (
  echo ERROR: Run from EMS\helpers\ on the server.
  pause
  exit /b 1
)

echo [1/6] Remove incompatible Puppeteer Chrome 146 cache
if exist .cache\puppeteer rd /s /q .cache\puppeteer
echo.
echo [2/6] npm ci (production)
call npm ci --omit=dev
if errorlevel 1 exit /b 1
echo.
echo [3/6] Install Puppeteer 19.4.0 (Chromium 109.0.5412 era)
call npm install puppeteer@19.4.0 --save-exact --omit=dev
if errorlevel 1 exit /b 1
echo.
echo [4/6] Install Chrome 109
set PS1=%~dp0install_chrome109_ws2012.ps1
if not exist "%PS1%" set PS1=%~dp0..\scripts\install_chrome109_ws2012.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -BackendRoot "%CD%"
if errorlevel 1 exit /b 1
echo.
echo [5/6] Verify spawn
node -e "const r=require('./lib/resolvePuppeteerChrome');const p=require('puppeteer');const x=r.resolvePuppeteerChromeExecutable(p);console.log(JSON.stringify(x,null,2));if(!x.executablePath||x.spawnProbe&&!x.spawnProbe.ok)process.exit(1)"
if errorlevel 1 exit /b 1
echo.
echo [6/6] Merge chrome109.env.snippet into .env — then restart PM2 from site root.
if exist chrome109.env.snippet type chrome109.env.snippet
pause
