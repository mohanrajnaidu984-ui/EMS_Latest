const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'server', 'routes', 'pricing.js');
let content = fs.readFileSync(filePath, 'utf8');

// We need to inject visibleJobIds calculation and use it.

// 1. Locate filtered jobs calculation
const startMarker = 'const allVisibleIds = new Set([...selfJobIds, ...descendantIds]);';
const endMarker = 'console.log(\'Final Visible:\', visibleJobs);';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
    // We insert ID sets after visibleJobs definition
    const insertionPoint = content.indexOf(';', content.indexOf('visibleJobs =', startIndex)) + 1;

    // Check if already patched
    if (!content.includes('visibleJobIds')) {
        const insert = `\n            const visibleJobIds = allVisibleIds; // ID Set\n            const editableJobIds = new Set(selfJobIds); // ID Set`;
        content = content.slice(0, insertionPoint) + insert + content.slice(insertionPoint);
        console.log('Injected ID sets.');
    }
} else {
    console.error('Markers for calculation not found');
}

// 2. Locate Response Map
const mapStartMarker = 'jobs.map(j => ({';
const mapEndMarker = 'isValid: true'; // Or just end of map block?
// Look for visible: ... line
const visibleLine = 'visible: visibleJobs.includes(j.ItemName),';
const editableLine = 'editable: editableJobs.includes(j.ItemName)';

if (content.includes(visibleLine)) {
    content = content.replace(visibleLine, '                visible: typeof visibleJobIds !== \'undefined\' ? visibleJobIds.has(j.ID) : visibleJobs.includes(j.ItemName),');
    console.log('Updated visible check.');
}
if (content.includes(editableLine)) {
    content = content.replace(editableLine, '                editable: typeof editableJobIds !== \'undefined\' ? editableJobIds.has(j.ID) : editableJobs.includes(j.ItemName)'); // Accessing global scope vars inside map? Yes, closure.
    console.log('Updated editable check.');
}

fs.writeFileSync(filePath, content, 'utf8');
