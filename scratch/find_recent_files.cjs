const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../server');
const now = Date.now();

const files = fs.readdirSync(dir)
    .map(name => {
        const p = path.join(dir, name);
        try {
            const stats = fs.statSync(p);
            return { name, mtime: stats.mtimeMs, size: stats.size };
        } catch {
            return null;
        }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);

console.log("Recently modified server files:");
files.slice(0, 10).forEach(f => {
    console.log(`${f.name} - ${new Date(f.mtime).toISOString()} - ${f.size} bytes`);
});
