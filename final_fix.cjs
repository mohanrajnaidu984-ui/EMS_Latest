const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/Pricing/PricingForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// --- Replace Main Loop ---
// Find start
const loopStartMarker = '{groups[groupName].map(option => (';
const loopStartIndex = content.indexOf(loopStartMarker);

if (loopStartIndex === -1) {
    console.error('Loop Start not found - trying looser match');
    // ...
    process.exit(1);
}

// Find end of this map block
// It ends with `))}` before `</React.Fragment>`
const loopEndMarker = '</React.Fragment>';
const loopEndMarkerIndex = content.indexOf(loopEndMarker, loopStartIndex);

if (loopEndMarkerIndex === -1) {
    console.error('Loop End not found');
    process.exit(1);
}

// The map closes with `))}` (or `))}`) just before the fragment end.
// Let's find the last `))}` before loopEndMarkerIndex.
const loopBlockEndIndex = content.lastIndexOf('))}', loopEndMarkerIndex);
if (loopBlockEndIndex === -1 || loopBlockEndIndex < loopStartIndex) {
    console.error('Map closing braces not found');
    process.exit(1);
}

// target substring is from loopStartIndex to loopBlockEndIndex + 3 (length of '))}')
const loopStart = loopStartIndex;
const loopEnd = loopBlockEndIndex + 3;

// Ensure we have the right block
// console.log("Replacing block:", content.substring(loopStart, loopStart + 100) + " ... " + content.substring(loopEnd - 20, loopEnd));

const loopReplacement = `{groups[groupName].map(option => {
                                                            let targetJobName = option.itemName;
                                                            if (!targetJobName) {
                                                                const leadJob = visibleJobs.find(j => j.isLead);
                                                                targetJobName = leadJob ? leadJob.itemName : visibleJobs[0]?.itemName; 
                                                            }
                                                            
                                                            const key = \`\${option.id}_\${targetJobName}\`;
                                                            const canEdit = pricingData.access.editableJobs && pricingData.access.editableJobs.includes(targetJobName);

                                                            return (
                                                                <tr key={option.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                                    <td style={{ padding: '12px 16px', fontWeight: '500', color: '#1e293b' }}>{option.name}</td>
                                                                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
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
                                                                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                                        {((pricingData.access.hasLeadAccess && !option.itemName) ||
                                                                            (option.itemName && pricingData.access.editableJobs.includes(option.itemName) && !pricingData.access.hasLeadAccess)) && (
                                                                                <button
                                                                                    onClick={() => deleteOption(option.id)}
                                                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                                                                >
                                                                                    <Trash2 size={16} />
                                                                                </button>
                                                                            )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}`;

let newContent = content.substring(0, loopStart) + loopReplacement + content.substring(loopEnd);


// --- Replace Total Row ---
// Find `visibleJobs.length > 1 && visibleJobs.slice(1).map`
// This renders the extra empty cells. We want to remove it.
const totalRowLoopStartMarker = '{visibleJobs.length > 1 && visibleJobs.slice(1).map';
const totalRowLoopStartIndex = newContent.indexOf(totalRowLoopStartMarker);

if (totalRowLoopStartIndex !== -1) {
    // Find the end: `))}`
    const totalRowLoopEndIndex = newContent.indexOf('))}', totalRowLoopStartIndex);
    if (totalRowLoopEndIndex !== -1) {
        // Remove from start to end+3
        // And we should probably leave one Empty Cell `<td></td>` ? 
        // No, the table has 3 columns: Name, Price, Delete.
        // Total Row has: 
        // 1. Label "Total" (col 1)
        // 2. Value (col 2)
        // 3. (Loop was adding cols 3..N)
        // 4. `<td></td>` (Last col / Delete col)

        // Wait, Header has 3 Cols: [Options] [Price] [Empty(Delete)]
        // Total Row currently:
        // [Total Label]
        // [Total Value]
        // {Loop for extra cols}
        // [Empty Cell]

        // If we remove the loop, we are left with:
        // [Total Label]
        // [Total Value]
        // [Empty Cell]
        // This is exactly 3 columns. Perfect.

        newContent = newContent.substring(0, totalRowLoopStartIndex) + newContent.substring(totalRowLoopEndIndex + 3);
    }
}

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Successfully patched PricingForm with Final Fix.');
