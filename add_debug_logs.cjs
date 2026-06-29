const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'Quote', 'QuoteForm.jsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let idx = -1;
for (let i = 1040; i < 1080; i++) {
    if (lines[i] && lines[i].trim() === '})();' && lines[i - 1].includes('return false;')) {
        idx = i + 1;
        break;
    }
}

if (idx === -1) {
    console.error('Marker not found');
    process.exit(1);
}

const newDocs = [
    "                    if (job.itemName && job.itemName.toLowerCase().includes('bms')) {",
    "                        console.log(`[Filter Debug] Job: ${job.itemName}, ID: ${job.id}, Parent: ${job.parentId}`);",
    "                        console.log(`[Filter Debug]  - EditableName: ${isEditableName}`);",
    "                        console.log(`[Filter Debug]  - Descendant: ${isEditableDescendant}`);",
    "                        console.log(`[Filter Debug]  - AllowedQuoteIds has it? ${allowedQuoteIds.has(job.id)}`);",
    "                        console.log(`[Filter Debug]  - HasLimited: ${hasLimitedAccess}`);",
    "                        console.log(`[Filter Debug]  - Result: ${(hasLimitedAccess && !allowedQuoteIds.has(job.id) && !isEditableName && !isEditableDescendant) ? 'HIDDEN' : 'VISIBLE'}`);",
    "                    }"
];

lines.splice(idx, 0, ...newDocs);
fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Added debug logs.');
