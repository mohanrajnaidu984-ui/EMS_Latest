const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/Pricing/PricingForm.jsx');
const content = fs.readFileSync(filePath, 'utf8');

// Find the area around "groups[groupName].map"
const pivot = content.indexOf('groups[groupName].map');
if (pivot === -1) {
    fs.writeFileSync('debug_output.txt', 'Pivot not found');
} else {
    // Dump 1000 chars around it
    const snippet = content.substring(pivot - 100, pivot + 2000);
    fs.writeFileSync('debug_output.txt', snippet);
}
