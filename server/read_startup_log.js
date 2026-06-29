const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'debug.log');

try {
    const data = fs.readFileSync(logFile, 'utf8');
    const lines = data.trim().split('\n');
    console.log(lines.slice(-20).join('\n'));
} catch (err) {
    console.error(err);
}
