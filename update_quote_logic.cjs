const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'Quote', 'QuoteForm.jsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Target Lines
// Note: Line 1053 in display (1-based) is index 1052.
const startIdx = 1052;
const endIdx = 1077; // 1-based line 1077, index 1076.
// So we want to remove from 1052 to 1076 inclusive.
// Count = 1076 - 1052 + 1 = 25 lines.

// Verify
const verifyStart = lines[startIdx].trim();
console.log('Start Line (1053):', verifyStart);
const verifyEnd = lines[endIdx - 1].trim(); // lines[1076]
console.log('End Line (1077):', verifyEnd);

// Safety Logic
// Allow flexibility if lines shifted by 1 or 2
let adjustedStartIdx = startIdx;
if (!verifyStart.includes('TOKEN-BASED') && !verifyStart.includes('STRICT SCOPING')) {
    console.log('Searching for correct start line...');
    // Search around +/- 5 lines
    let found = false;
    for (let i = startIdx - 5; i < startIdx + 5; i++) {
        if (lines[i] && (lines[i].includes('TOKEN-BASED') || lines[i].includes('STRICT SCOPING'))) {
            adjustedStartIdx = i;
            found = true;
            console.log('Found start line at index:', i);
            break;
        }
    }
    if (!found) {
        console.error('Could not find start marker!');
        process.exit(1);
    }
}

// Find End Line relative to start?
// We expect to find 'let price = ...' around verifyEnd
let adjustedEndIdx = adjustedStartIdx + 24; // Initial guess (25 lines total)
// Search for end line containing 'let price ='
let foundEnd = false;
for (let i = adjustedStartIdx + 20; i < adjustedStartIdx + 30; i++) {
    if (lines[i] && lines[i].includes('let price =') && lines[i].includes('parseFloat')) {
        adjustedEndIdx = i + 1; // End index exclusive for slice/splice? No, splice takes count.
        // wait, splice takes (start, deleteCount).
        // If we want to delete line i, we include it.
        // So deleteCount = i - adjustedStartIdx + 1.
        foundEnd = true;
        console.log('Found end line at index:', i);
        break;
    }
}

if (!foundEnd) {
    console.error('Could not find end marker (let price = ...)!');
    // Fallback to minimal replacement? No, too risky.
    process.exit(1);
}

const deleteCount = (adjustedEndIdx - 1) - adjustedStartIdx + 1; // EndIdx is EXCLUSIVE? No, I set it to i+1.
// If i=100, deleteCount = 100 - start + 1?
// wait, adjustedEndIdx is the index AFTER the last line to delete?
// If i matches line 1076. deleteCount = 1076 - 1052 + 1 = 25.
// So usage: splice(adjustedStartIdx, deleteCount, ...newLines).

const newLines = [
    "                    // IMPACT: Resolves 'Hidden Price' (Step 1189) by checking explicit price first.",
    "                    const key = `${opt.id}_${job.id}`;",
    "                    let val = data.values[key];",
    "                    let price = val ? parseFloat(val.Price || 0) : 0;",
    "",
    "                    // Only enforce scoping if price is 0 (to prevent double counting)",
    "                    if (price <= 0) {",
    "                        const normalizeTokens = (s) => (s || '').toLowerCase()",
    "                            .replace(/[^a-z0-9]/g, ' ')",
    "                            .split(/\\s+/)",
    "                            .filter(w => w.length > 2 && !['sub', 'job', 'and', 'for', 'the'].includes(w) && !/^l\\d+$/.test(w));",
    "",
    "                        const optTokens = normalizeTokens(opt.itemName);",
    "                        const jobTokens = normalizeTokens(job.itemName);",
    "",
    "                        if (optTokens.length > 0 && jobTokens.length > 0) {",
    "                             const hasOverlap = optTokens.some(ot => jobTokens.some(jt => jt.includes(ot) || ot.includes(jt)));",
    "                             if (!hasOverlap) {",
    "                                 return; // Skip mismatch",
    "                             }",
    "                        }",
    "                    }"
];

console.log(`Replacing ${deleteCount} lines starting at ${adjustedStartIdx}`);
lines.splice(adjustedStartIdx, deleteCount, ...newLines);

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('File updated successfully.');
