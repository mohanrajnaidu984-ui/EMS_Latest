const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/Pricing/PricingForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// We want to replace the standard loop logic with Single Column Logic.
// Find the start of the `groups[groupName].map` block.
const startMarker = `                                                        {groups[groupName].map(option => (`;
const endMarker = `                                                        ))}`;

const startIndex = content.indexOf(startMarker);
if (startIndex === -1) {
    console.error('Start marker not found');
    console.log('Content snippet around expected area:', content.substring(content.indexOf('return sortedGroupNames.map'), content.indexOf('return sortedGroupNames.map') + 500));
    process.exit(1);
}

// Find the matching closing bracket for the map.
// The map ends with `))}` before `</React.Fragment>`.
// So let's look for `</React.Fragment>` and go back a bit?
// Or search for the known previous content structure?
// The previous content ends with:
// `                                                            </tr>
//                                                         ))}
//                                                     </React.Fragment>`

// Let's find `</React.Fragment>` after start index.
const fragmentEndIndex = content.indexOf('</React.Fragment>', startIndex);
if (fragmentEndIndex === -1) {
    console.error('Fragment end not found');
    process.exit(1);
}

// The map closure `))}` should be just before that.
// We want to replace everything from `startIndex` up to the line before `</React.Fragment>`.

const replacement = `                                                        {groups[groupName].map(option => {
                                                            // Determine Target Job (Lead or Sub)
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

// Construct new content
// We replace from `groups[groupName].map...` until just before `</React.Fragment>`
// BUT, the previous code had `))}` on a separate line.
// Let's rely on `fragmentEndIndex`.
// The content to replace ends at `fragmentEndIndex`.
// But we need to keep `</React.Fragment>`.

const newContent = content.substring(0, startIndex) + replacement + '\n' + content.substring(fragmentEndIndex);

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Successfully patched PricingForm with Single Column Logic.');
