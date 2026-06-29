const fs = require('fs');

const fileName = process.argv[2];

if (!fileName) {
    console.error('Please provide a filename');
    process.exit(1);
}

try {
    // Try reading as utf-8 first
    let content = fs.readFileSync(fileName);

    // Check for BOM (0xFF, 0xFE) indicating UTF-16LE
    if (content.length >= 2 && content[0] === 0xFF && content[1] === 0xFE) {
        content = fs.readFileSync(fileName, 'utf16le');
    } else {
        content = content.toString('utf8');
    }

    console.log(content);
} catch (err) {
    console.error('Error reading file:', err);
}
