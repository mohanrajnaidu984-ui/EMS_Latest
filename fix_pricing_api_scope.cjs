const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'server', 'routes', 'pricing.js');
let content = fs.readFileSync(filePath, 'utf8');

const marker = "if (userRole === 'Admin') {";
const idx = content.indexOf(marker);

if (idx !== -1 && !content.includes('let visibleJobIds')) {
    content = content.slice(0, idx) + '        let visibleJobIds, editableJobIds;\n        ' + content.slice(idx);
    console.log('Injected declarations.');
} else {
    console.log('Declarations already present or marker not found.');
}

// Remove const keyword to assign to outer scope variables
if (content.includes('const visibleJobIds = allVisibleIds;')) {
    content = content.replace('const visibleJobIds = allVisibleIds;', 'visibleJobIds = allVisibleIds;');
    console.log('Fixed visibleJobIds assignment.');
}
if (content.includes('const editableJobIds = new Set(selfJobIds);')) {
    content = content.replace('const editableJobIds = new Set(selfJobIds);', 'editableJobIds = new Set(selfJobIds);');
    console.log('Fixed editableJobIds assignment.');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed scope issues.');
