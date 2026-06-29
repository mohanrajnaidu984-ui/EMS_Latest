$process = Get-WmiObject Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -like "*index.js*" }

if ($process) {
    Write-Host "Found Server Process: PID $($process.ProcessId)"
    Write-Host "Command Line: $($process.CommandLine)"
    Stop-Process -Id $process.ProcessId -Force
    Write-Host "Killed Process $($process.ProcessId)"
} else {
    Write-Host "Server process 'index.js' not found."
}
