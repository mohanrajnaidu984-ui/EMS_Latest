const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/Pricing/PricingForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Target start: {visibleJobs.map((job, idx) => {
const startMarker = 'visibleJobs.map((job, idx) => {';
const startIndex = content.indexOf(startMarker);

if (startIndex === -1) {
    console.error('Start marker not found');
    process.exit(1);
}

// Find the opening brace '{' of the function body
const openBraceIndex = content.indexOf('{', startIndex);
// We need to find the matching closing brace '}' for THIS block.
// And then the closing ')' and '}' for the expression: `})}`

let braceCount = 1; // We are at the first '{'
let currentIndex = openBraceIndex + 1;
let endIndex = -1;

while (currentIndex < content.length) {
    if (content[currentIndex] === '{') {
        braceCount++;
    } else if (content[currentIndex] === '}') {
        braceCount--;
        if (braceCount === 0) {
            endIndex = currentIndex;
            break;
        }
    }
    currentIndex++;
}

if (endIndex === -1) {
    console.error('End of block not found');
    process.exit(1);
}

// The block ends at `endIndex` (which is the closing '}').
// The map call usually looks like `.map((...) => { ... })`
// So after `}`, we expect `)`.
// And since it's inside `{ ... }` in JSX, we assume we want to replace the whole `{visibleJobs.map(...)}` expression?
// Wait, the code is:
// {visibleJobs.map((job, idx) => { ... })}
// So we need to find the closing '}' of the JSX expression too?
// The syntax in file is:
// <td ...>{option.name}</td>
// {visibleJobs.map(...)}

// `startIndex` points to `visible...`. The `{` is before it.
// Let's verify if there is a `{` before `startMarker`.
const preStart = content.lastIndexOf('{', startIndex);
// Check if it's the one wrapping the map.
// If it is, we replace from `preStart`.

// Let's safely replace from `startIndex` (visibleJobs...) to `endIndex` + 1 (the `)` matching map).
// And we assume it is wrapped in `{}` in the file.
// If we replace `visibleJobs.map(...)` with `(() => { ... })()`, it remains valid inside `{ ... }`.

// So we replace from `startIndex` to `endIndex` + 1 (to include the `)` of map).
// Check character after endIndex?
const closingParenIndex = content.indexOf(')', endIndex); // Should be immediately after `}`
// `})`

// Replacement Logic
const replacement = `(() => {
                                                                    // Determine Target Job (Lead or Sub)
                                                                    let targetJobName = option.itemName;
                                                                    if (!targetJobName) {
                                                                        const leadJob = visibleJobs.find(j => j.isLead);
                                                                        targetJobName = leadJob ? leadJob.itemName : visibleJobs[0]?.itemName; 
                                                                    }
                                                                    
                                                                    const key = \`\${option.id}_\${targetJobName}\`;
                                                                    const canEdit = pricingData.access.editableJobs && pricingData.access.editableJobs.includes(targetJobName);

                                                                    return (
                                                                        <td key={key} style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                                            <input
                                                                                type="number"
                                                                                value={values[key] || ''}
                                                                                onChange={(e) => handleValueChange(option.id, targetJobName, e.target.value)}
                                                                                disabled={!canEdit}
                                                                                placeholder="0.00"
                                                                                step="0.01"
                                                                                style={{
                                                                                    width: '100%',
                                                                                    maxWidth: '150px',
                                                                                    padding: '8px 10px',
                                                                                    border: '1px solid #e2e8f0',
                                                                                    borderRadius: '4px',
                                                                                    fontSize: '14px',
                                                                                    textAlign: 'right',
                                                                                    background: canEdit ? 'white' : '#f1f5f9',
                                                                                    cursor: canEdit ? 'text' : 'not-allowed'
                                                                                }}
                                                                            />
                                                                        </td>
                                                                    );
                                                                })()`;

// We replace `visibleJobs.map((job, idx) => { ... })`
// The `startIndex` is at `visibleJobs...`
// The `closingParenIndex` is the `)` after `}`.
const newContent = content.substring(0, startIndex) + replacement + content.substring(closingParenIndex + 1);

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Successfully patched PricingForm with Robust Script.');
