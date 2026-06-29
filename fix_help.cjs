const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'Help', 'Help.jsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace `->` with `&rarr;` globally
content = content.replace(/->/g, '&rarr;');

fs.writeFileSync(filePath, content);
console.log('Fixed Help.jsx');
