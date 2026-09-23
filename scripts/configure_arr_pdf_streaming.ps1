#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Tune IIS Application Request Routing for EMS quote PDF streaming.

.DESCRIPTION
  Local Vite/dev proxies stream Node responses. Production IIS ARR buffers reverse-proxy
  responses by default (responseBufferLimit), so the browser only starts receiving the PDF
  after the entire body is buffered — large quotes feel "stuck" until generation+buffer finish.

  This script:
  - Enables ARR proxy
  - Sets proxy timeout to 300s (Puppeteer PDF / long reports; was 180s and caused 502s)
  - Sets responseBufferLimit = 0 (stream immediately to client)

  IMPORTANT (ChatBox / Socket.IO):
  Node HTTP_KEEP_ALIVE_TIMEOUT_MS on EMS-API must be GREATER than this ARR timeout
  (use 310000+). If Node closes keep-alive first, ARR reuses a dead socket → intermittent
  502 and the UI reports "backend disconnected".

  Run once on the EMS web server after installing ARR + URL Rewrite.
#>
Import-Module WebAdministration -ErrorAction Stop

Write-Host "Enabling ARR proxy..."
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' `
  -Filter 'system.webServer/proxy' -Name 'enabled' -Value $true

Write-Host "Setting ARR proxy timeout to 00:05:00..."
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' `
  -Filter 'system.webServer/proxy' -Name 'timeout' -Value '00:05:00'

Write-Host "Setting ARR responseBufferLimit = 0 (stream PDF / large responses)..."
try {
    Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' `
      -Filter 'system.webServer/proxy' -Name 'responseBufferLimit' -Value 0
    Write-Host "OK: responseBufferLimit=0"
} catch {
    Write-Host "WARN: could not set responseBufferLimit — set manually in IIS Manager:"
    Write-Host "  Server → Application Request Routing Cache → Server Proxy Settings → Response Buffer Limit = 0"
    Write-Host $_.Exception.Message
}

Write-Host ""
Write-Host "Done. Recycle the EMS app pool or run: iisreset"
Write-Host "Verify: Download a large quote PDF — browser download should start as soon as Node begins streaming."
