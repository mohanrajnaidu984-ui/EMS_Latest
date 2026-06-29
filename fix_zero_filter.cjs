const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/Pricing/PricingForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Target Block:
// // Zero-Value Filter Logic
// let rowTotal = 0;
// visibleJobs.forEach(job => {
//     const key = `${opt.id}_${job.itemName}`;
//     const val = values?.[key]?.Price;
//     rowTotal += val ? parseFloat(val) : 0;
// });

const targetStart = '// Zero-Value Filter Logic';
const startIndex = content.indexOf(targetStart);

if (startIndex === -1) {
    console.error('Target start not found.');
    process.exit(1);
}

// Find the end of the forEach block
// It ends with `});`
const loopEndMarker = '});';
const loopEndIndex = content.indexOf(loopEndMarker, startIndex);

if (loopEndIndex === -1) {
    console.error('Loop end not found.');
    process.exit(1);
}

// Replacement Logic
const newLogic = `// Zero-Value Filter Logic
                                                    let rowTotal = 0;
                                                    // FIX: Check ALL jobs to prevent hiding valid sub-job values
                                                    pricingData.jobs.forEach(job => {
                                                        const key = \`\${opt.id}_\${job.itemName}\`;
                                                        const val = values?.[key]?.Price;
                                                        rowTotal += val ? parseFloat(val) : 0;
                                                    });`;

// Replace from startIndex to loopEndIndex + length
const originalBlock = content.substring(startIndex, loopEndIndex + loopEndMarker.length);
const newContent = content.substring(0, startIndex) + newLogic + content.substring(loopEndIndex + loopEndMarker.length);

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Successfully fixed Zero-Value Filter logic.');
