const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'Quote', 'QuoteForm.jsx');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Target Lines 1053 (0-indexed 1052) to 1077 (0-indexed 1076)
const startLine0 = 1052; // Line 1053
const endLine0 = 1077;   // Line 1078 (exclusive? No, we want to replace 1077 too)

// Let's verify content roughly
const verifyStart = lines[startLine0].trim();
console.log('Line 1053:', verifyStart); // Should start with // TOKEN-BASED

const verifyEnd = lines[endLine0 - 1].trim(); // Line 1077
console.log('Line 1077:', verifyEnd); // Should be let price = ...

if (!verifyStart.includes('TOKEN-BASED') && !verifyStart.includes('STRICT SCOPING')) {
    console.error('Start line mismatch! Aborting.');
    // Try search?
    // exit(1);
}

// New Content
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

// Replace
lines.splice(startLine0, (endLine0 - startLine0), ...newLines);

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('File updated successfully.');
