const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'Quote', 'QuoteForm.jsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Target Lines (1-based from view_file lines 853 to 866)
// 0-indexed: 852 to 865.
const startIdx = 852;
const endIdx = 865;
const deleteCount = endIdx - startIdx + 1; // 14 lines

// Verify
const verifyStart = lines[startIdx].trim();
console.log('Start Line (853):', verifyStart);
const verifyEnd = lines[endIdx].trim();
console.log('End Line (866):', verifyEnd);

let adjustedStartIdx = startIdx;

// Safety Check
if (!verifyStart.includes('pData.values.forEach')) {
    console.log('Searching for correct start line...');
    let found = false;
    for (let i = startIdx - 10; i < startIdx + 10; i++) {
        if (lines[i] && lines[i].includes('pData.values.forEach')) {
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

// Find End Line relative to new start
// Look for 'pData.values = groupedValues' within range
let adjustedEndIdx = adjustedStartIdx + 13; // default guess
let foundEnd = false;
for (let i = adjustedStartIdx + 10; i < adjustedStartIdx + 20; i++) {
    if (lines[i] && lines[i].includes('pData.values = groupedValues')) {
        adjustedEndIdx = i;
        foundEnd = true;
        console.log('Found end line at index:', i);
        break;
    }
}

if (!foundEnd) {
    console.error('Could not find end marker!');
    process.exit(1);
}

const adjustedDeleteCount = adjustedEndIdx - adjustedStartIdx + 1;

const newLines = [
    "                    pData.values.forEach(v => {",
    "                        const rawCust = v.CustomerName || pData.activeCustomer || 'Main';",
    "                        // ROBUST KEY MATCHING (Step 1253)",
    "                        const custKey = normalize(rawCust); ",
    "                        if (!groupedValues[custKey]) groupedValues[custKey] = {};",
    "",
    "                        if (v.EnquiryForID) {",
    "                            groupedValues[custKey][`${v.OptionID}_${v.EnquiryForID}`] = v;",
    "                        }",
    "                    });",
    "                }",
    "                pData.allValues = groupedValues;",
    "",
    "                // Set active values for current view customer using normalized key",
    "                // This ensures 'Civil Project ' matches 'Civil Project'",
    "                pData.values = groupedValues[normalize(cxName || '')] || {};"
];

console.log(`Replacing ${adjustedDeleteCount} lines starting at ${adjustedStartIdx}`);
lines.splice(adjustedStartIdx, adjustedDeleteCount, ...newLines);

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('File updated successfully.');
