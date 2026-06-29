const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/Pricing/PricingForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update Header: Remove the empty 3rd TH
// <th style={{ padding: '12px 16px', width: '50px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}></th>
const headerRegex = /<th style=\{\{ padding: '12px 16px', width: '50px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' \}\}>\s*<\/th>/;
content = content.replace(headerRegex, '');

// 2. Update Colspans: 3 -> 2
// <td colSpan={3}
const colspanRegex = /<td colSpan=\{3\}/g;
content = content.replace(colspanRegex, '<td colSpan={2}');

// 3. Update Row Rendering (Merge Input and Delete)
// We need to capture the Input TD and the Delete TD and merge them.
// This is complex to regex. Let's find the specific block again using markers.

const loopStartMarker = '{groups[groupName].map(option => {';
const loopStartIndex = content.indexOf(loopStartMarker);

// Find the return (...) block inside the map
const returnStartMarker = 'return (';
const returnIndex = content.indexOf(returnStartMarker, loopStartIndex);

if (returnIndex !== -1) {
    // Find the end of the return statement (the `);` before `})`)
    // Actually we can just identify the TR block.
    const trStart = content.indexOf('<tr', returnIndex);
    const trEnd = content.indexOf('</tr>', trStart);

    if (trStart !== -1 && trEnd !== -1) {
        const fullRow = content.substring(trStart, trEnd + 5); // +5 for </tr>

        // We want to reconstruct this row.
        // It has 3 TDs.
        // TD 1: Name
        // TD 2: Input
        // TD 3: Button

        // Extract TD 1
        const td1Start = fullRow.indexOf('<td');
        const td1End = fullRow.indexOf('</td>', td1Start) + 5;
        const td1 = fullRow.substring(td1Start, td1End);

        // Extract TD 2 content (Input)
        const td2Start = fullRow.indexOf('<td', td1End);
        const td2End = fullRow.indexOf('</td>', td2Start) + 5;
        const td2Full = fullRow.substring(td2Start, td2End);
        // Extract inner input
        const inputStart = td2Full.indexOf('<input');
        const inputEnd = td2Full.lastIndexOf('/>') + 2;
        const inputHtml = td2Full.substring(inputStart, inputEnd);

        // Extract TD 3 content (Button Logic)
        const td3Start = fullRow.indexOf('<td', td2End);
        const td3End = fullRow.indexOf('</td>', td3Start) + 5;
        const td3Full = fullRow.substring(td3Start, td3End);
        // Extract inner logic
        const logicStart = td3Full.indexOf('{');
        const logicEnd = td3Full.lastIndexOf('}'); // This finds the last `}` of the block? No, careful.
        // content of td3 is `{((pricingData...)) && ( <button...> )}`
        // `td3Full` is `<td ...> {logic} </td>`
        const innerContent3 = td3Full.substring(td3Full.indexOf('>') + 1, td3Full.lastIndexOf('<'));

        // Construct New TD 2 (Merged)
        const newTd2 = `<td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                                        ${inputHtml}
                                                                        {/* Delete Button */}
                                                                        ${innerContent3}
                                                                    </div>
                                                                </td>`;

        const newRow = `<tr key={option.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                                    ${td1}
                                                                    ${newTd2}
                                                                </tr>`;

        content = content.replace(fullRow, newRow);
    }
}

// 4. Update Total Row: Remove the last empty TD
// <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}> ... </tr>
// Look for the Total Row block.
const totalRowStartMarker = 'Render Total Row only if > 0';
const totalRowIndex = content.indexOf(totalRowStartMarker);

if (totalRowIndex !== -1) {
    // Find the next TR
    const trStart = content.indexOf('<tr', totalRowIndex);
    const trEnd = content.indexOf('</tr>', trStart);
    if (trStart !== -1 && trEnd !== -1) {
        const rowContent = content.substring(trStart, trEnd + 5);
        // Replace `<td></td>` with nothing?
        // Be careful not to verify too loosely.
        const lastTdRegex = /<td><\/td>\s*<\/tr>/;
        const newRowContent = rowContent.replace(lastTdRegex, '</tr>');
        content = content.replace(rowContent, newRowContent);
    }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully merged delete button into price column.');
