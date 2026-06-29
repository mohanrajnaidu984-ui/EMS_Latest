const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/Pricing/PricingForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Regex to find the start, allowing for variable indentation
// We look for `{` followed by `visibleJobs.map((job, idx) => {`
const startRegex = /\{\s*visibleJobs\.map\(\(job, idx\) => \{/;
const match = content.match(startRegex);

if (!match) {
    console.error('Regex match failed for visibleJobs.map');
    // Debug: print a chunk where we expect it
    const pivot = content.indexOf('groups[groupName].map');
    if (pivot !== -1) {
        console.log('Context around groups map:', content.substring(pivot, pivot + 500));
    }
    process.exit(1);
}

const startIndex = match.index;
// Find the actually opening brace of the function body `=> {`
const openBraceIndex = content.indexOf('{', startIndex + match[0].length - 1); // search back/around?
// Actually match[0] is `{ visibleJobs.map((job, idx) => {`
// So the last char is `{`.
const functionBodyStart = startIndex + match[0].length - 1;

console.log(`Found block at index ${startIndex}`);

// Count braces to find end
let braceCount = 1;
let currentIndex = functionBodyStart + 1;
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

// Check for the closing `)` and `}` of the expression
// The block we matched starts with `{` (JSX expression start).
// The map ends with `})` (End of map call).
// Then `}` (End of JSX expression).
// So after `endIndex` (which is `}` of function body), we expect `)}` ?
// No, match[0] started with `{`.
// So we are inside a JSX expression `{ ... }`.
// The map returns an array of elements.
// The map call is `visibleJobs.map(...)`.
// So it closes with `)`.
// And the JSX expression closes with `}`.
// So we expect `)}`.

const closingParen = content.indexOf(')', endIndex);
const closingBrace = content.indexOf('}', closingParen);

// We want to replace from `startIndex` (which includes the opening `{`) 
// to `closingBrace` (which is the closing `}` of the JSX expression).

// OR we preserve the JSX braces `{ ... }` and just replace the inner content?
// `match[0]` starts with `{`.
// If I use IIFE `(() => { ... })()`, I need to wrap it in `{}` for JSX -> `{ (() => { ... })() }`

// Let's replace the WHOLE expression `{visibleJobs.map(...)}` with `{(() => { ... })()}`.

const replacementCode = `(() => {
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

// Reconstruct
// startIndex points to `{`
// closingBrace points to `}`
// Replace content from startIndex+1 to closingBrace-1?
// Or replace the whole thing?
// Let's replace the whole thing: `{ ... }` -> `{ ... }`

const newContent = content.substring(0, startIndex) +
    '{' + replacementCode + '}' +
    content.substring(closingBrace + 1);

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Successfully patched PricingForm with Regex Script.');
