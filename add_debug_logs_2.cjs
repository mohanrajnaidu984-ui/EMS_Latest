const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src', 'components', 'Quote', 'QuoteForm.jsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let idx = -1;
for (let i = 915; i < 950; i++) {
    if (lines[i] && lines[i].includes('console.log(\'[calculateSummary] Selected Jobs:\', currentSelectedJobs);')) {
        idx = i + 1;
        break;
    }
}
if (idx !== -1) {
    lines.splice(idx, 0, "        console.log('[calculateSummary] activeJobs list:', activeJobs);");
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log('Added activeJobs log.');
} else {
    console.log('Log marker not found. Searching broader...');
    // Fallback: search for START
    for (let i = 910; i < 950; i++) {
        if (lines[i] && lines[i].includes('[calculateSummary] START')) {
            idx = i + 5; // Start + 5 lines down
            break;
        }
    }
    if (idx !== -1) {
        lines.splice(idx, 0, "        console.log('[calculateSummary] activeJobs list check:', Array.isArray(currentSelectedJobs) ? currentSelectedJobs : 'Not Array');");
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        console.log('Added activeJobs log (fallback).');
    }
}
