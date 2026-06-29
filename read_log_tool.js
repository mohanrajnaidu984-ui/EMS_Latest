const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'server', 'debug.log');

console.log('Reading log from:', logPath);

try {
    if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        console.log('File size:', stats.size);

        const readSize = Math.min(stats.size, 50000); // Read last 50KB
        const buffer = Buffer.alloc(readSize);
        const fd = fs.openSync(logPath, 'r');
        fs.readSync(fd, buffer, 0, readSize, stats.size - readSize);
        fs.closeSync(fd);

        console.log('--- LOG START ---');
        console.log(buffer.toString('utf8'));
        console.log('--- LOG END ---');
    } else {
        console.log('Log file not found.');
    }
} catch (e) {
    console.error('Error:', e.message);
}
