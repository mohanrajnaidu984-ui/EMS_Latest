@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -File "%~dp0install.ps1"
if errorlevel 1 echo Installation failed. Review the message above; do not disable company security policies.
pause
