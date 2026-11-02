param([string]$IisFrontendPath='C:\inetpub\wwwroot\EMS\frontend')
$ErrorActionPreference='Stop'
$target=[IO.Path]::GetFullPath($IisFrontendPath)
if(-not (Test-Path -LiteralPath (Join-Path $target 'index.html'))){throw 'IIS frontend index.html not found. Supply the actual frontend physical path.'}
$source=Join-Path $PSScriptRoot 'frontend'
if(-not (Test-Path -LiteralPath (Join-Path $source 'index.html'))){throw 'Run this script from the extracted EMS Outlook hotfix folder.'}
$backupDir=Join-Path (Split-Path $target -Parent) ('outlook-frontend-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupDir | Out-Null
Copy-Item -LiteralPath (Join-Path $target 'index.html') -Destination (Join-Path $backupDir 'index.html')
# Hashed assets coexist with the previous release; the entry HTML is switched last.
Get-ChildItem -LiteralPath (Join-Path $source 'assets') -File | ForEach-Object {
 $destination=Join-Path (Join-Path $target 'assets') $_.Name
 if(Test-Path -LiteralPath $destination){
  if((Get-FileHash -LiteralPath $_.FullName).Hash -ne (Get-FileHash -LiteralPath $destination).Hash){throw "Existing hashed asset differs: $($_.Name). No HTML switch performed."}
 }else{Copy-Item -LiteralPath $_.FullName -Destination $destination}
}
Copy-Item -LiteralPath (Join-Path $source 'index.html') -Destination (Join-Path $target 'index.html') -Force
Write-Host "Frontend hotfix installed. No IIS/API restart or backend/config change. Backup: $backupDir"
Write-Host 'Rollback: restore the backup index.html to the frontend directory. Old assets were retained.'
Write-Host 'Hard-refresh EMS, click Quote Email, and open the downloaded .eml in Outlook. Check PDF and selected attachments before sending.'
