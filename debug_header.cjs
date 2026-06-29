const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/Pricing/PricingForm.jsx');
const content = fs.readFileSync(filePath, 'utf8');

const marker = '<thead>';
let pos = 0;
let count = 0;

while (true) {
    const found = content.indexOf(marker, pos);
    if (found === -1) break;

    console.log(`Match ${count} at index ${found}`);
    console.log('Context:', content.substring(found - 20, found + 100));
    pos = found + 1;
    count++;
}
console.log(`Total matches: ${count}`);
