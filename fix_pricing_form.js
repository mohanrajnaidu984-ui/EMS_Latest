const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/Pricing/PricingForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// The block starts with `// Grouping Logic`
const startMarker = `// Grouping Logic`;
const indexStart = content.indexOf(startMarker);

if (indexStart === -1) {
    console.error('Start marker not found');
    process.exit(1);
}

// We want to wrap from `// Grouping Logic` ...
// ... up to the end of the map: `));`
// But there might be multiple `));`.
// The one we want is followed by `)}` and then `</tbody>`.
// Let's find `));` that is followed by `                                        )}`.

// Look for the end of the map function.
const endMarker = `));
                                        )}`; // This might be tricky with whitespace.

// Let's rely on the structure.
// The block I inserted ends with `));`.
// Before my insertion, it was `filteredOptions.map(...)`.
// After my insertion, it is `return sortedGroupNames.map(...)`.

// Let's find key pointers.
const endOfBlockVal = `));`;
const safetyCheck = `const groups = {};`;

if (content.indexOf(safetyCheck) === -1) {
    console.error('Safety check failed: grouping logic not found');
    process.exit(1);
}

// Find strict start location (start of the line with // Grouping Logic)
// It shares indentation with `) : (`
// Line 592: `                                        ) : (`
// Line 593: `                                            // Grouping Logic`

// I will just locate the substring `// Grouping Logic` and prepend `(() => {` before it (and indentation).
// And find the matching `));` and append `})()` after it.

// Search for the start match
const startMatch = content.match(/(\s+)\/\/ Grouping Logic/);
if (!startMatch) {
    console.error('Start match failed');
    process.exit(1);
}
const indentation = startMatch[1];
const startIndex = startMatch.index;

// Search for the end match: `));` followed by `)}`
// We know it is around line 680.
// Let's look for `));` that closes `sortedGroupNames.map`.
// It should be followed by `)}`.

const endPattern = /\)\);\s+\)\}/;
const endMatch = content.match(endPattern);

// Note: `endPattern` might match earlier if there are other maps?
// There is `visibleJobs.map` inside. It ends with `})}`?
// `visibleJobs.map` ends with `})}` usually.
// `sortedGroupNames.map` ends with `));` because `return (...)`.

const mapEndIndex = content.lastIndexOf('));');
if (mapEndIndex === -1) {
    console.error('End marker not found');
    process.exit(1);
}

// Check if this looks right.
// The closing brace of the ELSE block is `)}`.
// My map ends with `));`.
// So I should replace `// Grouping Logic` with `(() => { // Grouping Logic`
// And `));` with `)); })()`

const newContent = content.substring(0, startIndex) +
    indentation + '(() => {' + '\n' +
    content.substring(startIndex, mapEndIndex + 3) +
    ' })()' +
    content.substring(mapEndIndex + 3);

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Successfully wrapped PricingForm code.');
