
const fs = require('fs');
const content = fs.readFileSync('d:/Data/Anti gravity/EMS_Demo-by-Antigravity-master/EMS/New-EMS-de9b154a3f16b49898b382f5d7bad10bd9734b51/src/components/Quote/QuoteForm.jsx', 'utf8');

let openBraces = 0;
let lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    for (let char of line) {
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
    }
    if (openBraces < 0) {
        console.log(`Negative braces at line ${i + 1}`);
        // Reset or stop? Usually implies extra closing brace.
    }
}
console.log(`Final brace count: ${openBraces}`);
