const fs = require('fs');
const path = require('path');

try {
    const data = fs.readFileSync('diagnosis.txt', 'utf8'); // Assuming it's actually UTF8 if node wrote it? 
    // Wait, if PowerShell redirection wrote it, it might be UTF16.
    // Let's try to read it safely.
    console.log(data);
} catch (err) {
    // If utf8 fails, try reading as binary/buffer and converting
    console.log('Error reading as utf8');
}
