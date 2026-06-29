const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/Pricing/PricingForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find start and end of thead
const startMarker = '<thead>';
const endMarker = '</thead>';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error('Could not find thead block.');
    console.log('Start index:', startIndex);
    console.log('End index:', endIndex);
    process.exit(1);
}

// Remove the block, including the markers
// content.substring(0, startIndex) + content.substring(endIndex + endMarker.length)
// But we might want to trim the extra newline if any.

const newContent = content.substring(0, startIndex) + content.substring(endIndex + endMarker.length);

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Successfully removed thead block.');
