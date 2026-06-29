const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'Quote', 'QuoteForm.jsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Search for the marker I added in Step 1280 (approx line 1050)
let startIdx = -1;
for (let i = 1040; i < 1070; i++) {
    if (lines[i] && lines[i].includes('Ensure editable jobs are ALWAYS visible')) {
        startIdx = i - 1; // One line up is matches "// Filter:..."
        break;
    }
}

if (startIdx === -1) {
    console.error('Could not find start marker!');
    process.exit(1);
}

// Inspect lines to determine delete count
// We expect:
// 0: // Filter... 
// 1: // FIX... (Marker)
// 2: const isEditableName...
// 3: if (...) {
// 4:    return;
// 5: }
const endIdx = startIdx + 5;
const deleteCount = endIdx - startIdx + 1; // 6 lines

// Verify
console.log(`Replacing ${deleteCount} lines starting at index ${startIdx}`);
for (let i = 0; i < deleteCount; i++) {
    console.log(`[${startIdx + i}] ${lines[startIdx + i]}`);
}

const newLines = [
    "                    // Filter: If Limited Access, skip jobs outside scope",
    "                    // FIX: Ensure editable jobs AND their descendants are visible (Step 1289)",
    "                    const isEditableName = (data.access?.editableJobs || []).includes(job.itemName); ",
    "                    const isEditableDescendant = (() => {",
    "                        if (!hasLimitedAccess) return true;",
    "                        let curr = job;",
    "                        while(curr && curr.parentId) {",
    "                             const parent = data.jobs.find(j => j.id === curr.parentId);",
    "                             if (!parent) break;",
    "                             if ((data.access?.editableJobs || []).includes(parent.itemName)) return true;",
    "                             curr = parent;",
    "                        }",
    "                        return false;",
    "                    })();",
    "",
    "                    if (hasLimitedAccess && !allowedQuoteIds.has(job.id) && !isEditableName && !isEditableDescendant) {",
    "                        return;",
    "                    }"
];

lines.splice(startIdx, deleteCount, ...newLines);
fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('File updated successfully.');
