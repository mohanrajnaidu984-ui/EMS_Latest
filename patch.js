const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'src/components/Quote/QuoteForm.jsx');
const snippetPath = path.join(__dirname, 'snippet.txt');

const content = fs.readFileSync(targetPath, 'utf8');
const snippet = fs.readFileSync(snippetPath, 'utf8');

// Markers
const startMarker = 'if (pData.options && pData.values) {';
const endMarker = 'setPricingSummary(summary);';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker, startIndex);

if (startIndex === -1 || endIndex === -1) {
    console.error('FAILED: Markers not found.');
    console.log('Start Index:', startIndex);
    console.log('End Index:', endIndex);
    process.exit(1);
}

// Identify the end of the block properly.
// 'endMarker' is part of the line we want to replace IF we included it in snippet.
// My snippet includes BOTH the if block AND the setPricingSummary line.
// But wait, my snippet ENDS with 'setPricingSummary([]); }'.
// Let's look at snippet.txt again.
// Snippet starts with: if (pData.options...
// Snippet ends with: setPricingSummary([]); }

// The original code had:
// if (pData.options && pData.values) { ... }
// ...
// setPricingSummary(summary);

// So I should replace everything from 'startIndex' up to 'endIndex' + length of 'setPricingSummary(summary);'

const replaceCount = SnippetReplacer(content, snippet, startIndex, endIndex + endMarker.length);


function SnippetReplacer(fullText, newText, start, end) {
    console.log('Replacing from', start, 'to', end);
    const before = fullText.substring(0, start);
    const after = fullText.substring(end);

    // Check if we need to remove the extra '}' that might be lingering if I didn't capture the whole block?
    // In original code:
    // ... });
    // } 
    // setPricingSummary(summary);

    // My replacement:
    // ... });
    // setPricingSummary(...);
    // } else { ... }

    // It seems consistent.

    const newFileContent = before + newText + after;
    fs.writeFileSync(targetPath, newFileContent, 'utf8');
    console.log('SUCCESS: File patched.');
}
