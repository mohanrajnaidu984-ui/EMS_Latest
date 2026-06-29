const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/Quote/QuoteForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find start index
const startIndex = content.indexOf('const summary = [];');
if (startIndex === -1) {
    console.error('Start marker not found');
    process.exit(1);
}

// Find end index (after start)
const endIndex = content.indexOf('setPricingSummary(summary);', startIndex);
if (endIndex === -1) {
    console.error('End marker not found');
    process.exit(1);
}

// Calculate the full range to replace
const endReplaceIndex = endIndex + 'setPricingSummary(summary);'.length;

// Use simple string concatenation or careful escaping to avoid Syntax Errors
const newLogicPart1 = `
                        // Calculate Summary (Grouped)
                        let userHasEnteredPrice = false;

                        if (pData.options && pData.values) {
                            // Grouping structure: { 'JobName': { total: 0, items: [] } }
                            const groups = {};

                            pData.options.forEach(opt => {
                                // 1. Visibility Filter
                                let isVisible = false;
                                if (pData.access?.hasLeadAccess) {
                                    isVisible = true; 
                                } else if (opt.itemName && pData.access?.editableJobs?.includes(opt.itemName)) {
                                    isVisible = true;
                                }
                                if (!isVisible) return;

                                // 2. Calculate Total
                                let optionTotal = 0;
                                if (pData.jobs) {
                                    pData.jobs.forEach(job => {
                                        // key construction without backticks to be safe in this script
`;
const newLogicPart2 = "                                        const key = opt.id + '_' + job.itemName;";
const newLogicPart3 = `
                                        const val = pData.values[key];
                                        const price = val ? parseFloat(val.Price || 0) : 0;
                                        optionTotal += price;
                                    });
                                }

                                // 3. Zero Value Filter
                                if (optionTotal <= 0) return;

                                // 4. Grouping
                                const groupName = opt.itemName || pData.leadJob || 'General';
                                if (!groups[groupName]) {
                                    groups[groupName] = { total: 0, items: [] };
                                }
                                groups[groupName].items.push({ name: opt.name, total: optionTotal });
                                groups[groupName].total += optionTotal;

                                userHasEnteredPrice = true;
                            });

                            // Convert to array
                            const sortedSummary = [];
                            const leadName = pData.leadJob || 'General';
                            if (groups[leadName]) {
                                sortedSummary.push({ name: leadName, ...groups[leadName] });
                                delete groups[leadName];
                            }
                            Object.keys(groups).forEach(name => {
                                sortedSummary.push({ name: name, ...groups[name] });
                            });

                            setPricingSummary(sortedSummary);
                        } else {
                            setPricingSummary([]);
                        }`;

const newContent = content.substring(0, startIndex) + newLogicPart1 + newLogicPart2 + newLogicPart3 + content.substring(endReplaceIndex);

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Successfully patched QuoteForm.jsx');
