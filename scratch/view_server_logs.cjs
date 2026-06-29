const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../server');
const files = ['server_output.txt', 'server_log.txt', 'server_log_restart_final.txt', 'debug.log'];

files.forEach(name => {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) return;
    try {
        const text = fs.readFileSync(p, 'utf8');
        if (text.includes('smtp-draft') || text.includes('buildQuoteEmlDraftBuffer')) {
            console.log(`=== MATCH IN ${name} ===`);
            const lines = text.split('\n');
            lines.forEach((l, idx) => {
                if (l.includes('smtp-draft') || l.includes('buildQuoteEmlDraftBuffer') || l.includes('Error')) {
                    console.log(`${idx}: ${l}`);
                }
            });
        }
    } catch (e) {
        console.error(e.message);
    }
});
