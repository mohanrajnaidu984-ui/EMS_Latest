const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'Quote', 'QuoteForm.jsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Search for marker from Step 1302
let startIdx = -1;
for (let i = 1040; i < 1070; i++) {
    if (lines[i] && lines[i].includes('Ensure editable jobs AND their descendants are visible')) {
        startIdx = i - 1;
        break;
    }
}

if (startIdx === -1) {
    console.error('Could not find start marker!');
    process.exit(1);
}

// Find end of block
let endIdx = -1;
for (let i = startIdx; i < startIdx + 25; i++) {
    if (lines[i] && lines[i].trim() === '}' && lines[i - 1].trim() === 'return;') {
        // Found end of if block
        endIdx = i;
        break;
    }
}

if (endIdx === -1) {
    console.error('Could not find end of block!');
    process.exit(1);
}

const deleteCount = endIdx - startIdx + 1;

// Verify
console.log(`Replacing ${deleteCount} lines starting at index ${startIdx}`);
for (let i = 0; i < deleteCount; i++) {
    console.log(`[${startIdx + i}] ${lines[startIdx + i].trim().substring(0, 50)}...`);
}

const newLines = [
    "                    // Filter: If Limited Access, skip jobs outside scope",
    "                    // FIX: Ensure editable jobs AND their descendants are visible (Robust Normalized Check) (Step 1310)",
    "                    const normalizeName = (s) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');",
    "                    const editableNames = (data.access?.editableJobs || []).map(n => normalizeName(n));",
    "                    ",
    "                    const isEditableName = editableNames.includes(normalizeName(job.itemName));",
    "                    ",
    "                    const isEditableDescendant = (() => {",
    "                        if (!hasLimitedAccess) return true;",
    "                        let curr = job;",
    "                        while(curr && curr.parentId) {",
    "                             const parent = data.jobs.find(j => j.id === curr.parentId);",
    "                             if (!parent) break;",
    "                             if (editableNames.includes(normalizeName(parent.itemName))) return true;",
    "                             curr = parent;",
    "                        }",
    "                        return false;",
    "                    })();",
    "",
    "                    // Also check allowedQuoteIds (which comes from initial scoping)",
    "                    // But if isEditableName OR isEditableDescendant is true, we allow it.",
    "                    if (hasLimitedAccess && !allowedQuoteIds.has(job.id) && !isEditableName && !isEditableDescendant) {",
    "                        return;",
    "                    }"
];

lines.splice(startIdx, deleteCount, ...newLines);
fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('File updated successfully.');
