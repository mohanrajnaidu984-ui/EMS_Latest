const { exec } = require('child_process'); exec('cmd.exe /c start "" ""C:\\Windows\\Temp\\test.txt""', (err) => console.log('Err:', err));
