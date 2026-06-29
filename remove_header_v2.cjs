const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/Pricing/PricingForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const startMarker = '<thead>';
const endMarker = '</thead>';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error('Markers not found.');
    process.exit(1);
}

const blockToRemove = content.substring(startIndex, endIndex + endMarker.length);
console.log('REMOVING BLOCK:');
console.log(blockToRemove);

const newContent = content.substring(0, startIndex) + content.substring(endIndex + endMarker.length);

fs.writeFileSync(filePath, newContent, 'utf8');

// Verify
const verifyContent = fs.readFileSync(filePath, 'utf8');
if (verifyContent.includes('<thead>')) {
    console.error('VERIFICATION FAILED: <thead> still present.');
} else {
    console.log('VERIFICATION SUCCESS: <thead> removed.');
}
