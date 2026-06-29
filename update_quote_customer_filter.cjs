const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'Quote', 'QuoteForm.jsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let startIdx = -1;
for (let i = 980; i < 1000; i++) {
    if (lines[i] && lines[i].includes('// 0. Customer Filter')) {
        startIdx = i;
        break;
    }
}

if (startIdx === -1) {
    console.error('Could not find start marker!');
    process.exit(1);
}

// Find block end
let endIdx = -1;
for (let i = startIdx; i < startIdx + 20; i++) {
    if (lines[i] && lines[i].trim() === '}' && lines[i - 1].trim() === 'return;') {
        // Found end of if block
        endIdx = i;
        break;
    }
}

if (endIdx === -1) {
    console.error('Could not find end marker!');
    process.exit(1);
}

const deleteCount = endIdx - startIdx + 1;

console.log(`Replacing ${deleteCount} lines starting at index ${startIdx}`);
// Verify content
for (let i = 0; i < Math.min(5, deleteCount); i++) {
    console.log(`[${startIdx + i}] ${lines[startIdx + i].trim().substring(0, 50)}...`);
}

const newLines = [
    "            // 0. Customer Filter",
    "            // Only filter out if option has a customerName AND it doesn't match the active customer",
    "            // FIX: Normalized comparison to handle case/space differences (Step 1353)",
    "            const normalizeCust = (s) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');",
    "            const optCust = normalizeCust(opt.customerName);",
    "            const activeCust = normalizeCust(activeCustomer);",
    "",
    "            if (opt.customerName && activeCustomer && optCust !== activeCust) {",
    "                console.log(`[calculateSummary] Filtered out (customer mismatch):`, opt.name, 'opt:', opt.customerName, 'active:', activeCustomer);",
    "                return;",
    "            }"
];

lines.splice(startIdx, deleteCount, ...newLines);
fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('File updated successfully.');
