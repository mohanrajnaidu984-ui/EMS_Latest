const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, '../server/debug_quote_api.log');
try {
    const text = fs.readFileSync(logPath, 'utf8');
    const lines = text.split('\n');
    console.log(`Total lines in debug_quote_api.log: ${lines.length}`);
    console.log("Last 150 lines:");
    console.log(lines.slice(-150).join('\n'));
} catch (e) {
    console.error("Error reading log:", e.message);
}
