const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src', 'components', 'Quote', 'QuoteForm.jsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

const newLines = lines.filter(line => !line.includes('[Filter Debug]') && !line.includes('[calculateSummary] activeJobs'));

if (newLines.length !== lines.length) {
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
    console.log(`Removed ${lines.length - newLines.length} debug log lines.`);
} else {
    console.log('No debug logs found.');
}
