const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'Quote', 'QuoteForm.jsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Target Lines 1050-1053 (0-indexed 1049-1052)
const startIdx = 1049;
const endIdx = 1052;
const deleteCount = endIdx - startIdx + 1; // 4 lines

// Verify
const verifyStart = lines[startIdx].trim();
console.log('Start Line (1050):', verifyStart);

let adjustedStartIdx = startIdx;

if (!verifyStart.includes('jobs outside scope')) {
    console.log('Searching for correct start line...');
    let found = false;
    for (let i = startIdx - 10; i < startIdx + 10; i++) {
        if (lines[i] && lines[i].includes('jobs outside scope')) {
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

const newLines = [
    "                    // Filter: If Limited Access, skip jobs outside scope",
    "                    // FIX: Ensure editable jobs are ALWAYS visible even if ID check fails (Step 1276)",
    "                    const isEditableName = (data.access?.editableJobs || []).includes(job.itemName); ",
    "                    if (hasLimitedAccess && !allowedQuoteIds.has(job.id) && !isEditableName) {",
    "                        return;",
    "                    }"
];

console.log(`Replacing ${deleteCount} lines starting at ${adjustedStartIdx}`);
lines.splice(adjustedStartIdx, deleteCount, ...newLines);

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('File updated successfully.');
