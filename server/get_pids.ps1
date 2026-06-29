Get-WmiObject Win32_Process -Filter "name = 'node.exe'" | Select-Object CommandLine, ProcessId
