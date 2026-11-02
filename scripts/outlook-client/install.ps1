param([string]$EmsOrigin = 'http://151.50.1.38')
$ErrorActionPreference = 'Stop'
$parsedOrigin = [Uri]$EmsOrigin
if ($parsedOrigin.Scheme -notin @('http','https') -or $parsedOrigin.AbsolutePath -ne '/') { throw 'Supply only the EMS site origin, such as http://151.50.1.38' }
$origin = $parsedOrigin.GetLeftPart([UriPartial]::Authority)
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$nodeVersion = (& $nodePath --version).TrimStart('v')
if ([Version]$nodeVersion -lt [Version]'22.0.0') { throw 'Install Node.js 22 or newer on this workstation first.' }
if (-not (Test-Path 'Registry::HKEY_CLASSES_ROOT\Outlook.Application')) { throw 'Classic Outlook is not registered. Install/configure Classic Outlook on this workstation first.' }
$installDir = Join-Path $env:LOCALAPPDATA 'EMS\OutlookClient'
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'EMS Quote Outlook Helper.lnk'
$health = $null
try { $health = Invoke-RestMethod 'http://127.0.0.1:39281/health' -TimeoutSec 2 } catch {}
if ($health) { throw 'Port 39281 already has a helper. Close its window or sign out, then rerun this installer. No existing process was changed.' }
New-Item -ItemType Directory -Path (Join-Path $installDir 'lib') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'quote-outlook-client.cjs') -Destination $installDir -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Destination $installDir -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'lib\outlookDraftVbs.js') -Destination (Join-Path $installDir 'lib') -Force
@{allowedOrigins=@($origin)} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $installDir 'config.json') -Encoding ASCII
$helperPath = Join-Path $installDir 'quote-outlook-client.cjs'
$launcherPath = Join-Path $installDir 'start-hidden.vbs'
$launchCommand = '"' + $nodePath + '" "' + $helperPath + '"'
$launcher = 'CreateObject("WScript.Shell").Run "' + $launchCommand.Replace('"','""') + '", 0, False'
Set-Content -LiteralPath $launcherPath -Value $launcher -Encoding Unicode
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = '//B "' + $launcherPath + '"'
$shortcut.WorkingDirectory = $installDir
$shortcut.Save()
Start-Process -FilePath $shortcut.TargetPath -ArgumentList $shortcut.Arguments -WindowStyle Hidden
Start-Sleep -Seconds 2
$health = Invoke-RestMethod 'http://127.0.0.1:39281/health' -TimeoutSec 5
if ($health.version -ne '2026-10-31.1') { throw 'The expected helper did not start. Check port 39281.' }
Write-Host "Installed for $env:USERNAME. Starts at user sign-in. Allowed EMS site: $origin"
Write-Host 'Open Classic Outlook, then click Email in EMS. Nothing is sent automatically.'
