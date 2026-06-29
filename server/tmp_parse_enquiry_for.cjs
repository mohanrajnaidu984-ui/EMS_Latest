const fs = require('fs');
const d = fs.readFileSync('enquiry_for_13_full.json', 'utf8');
const start = d.indexOf('[');
const end = d.lastIndexOf(']');
if (start !== -1 && end !== -1) {
    const jsonText = d.substring(start, end + 1);
    try {
        const j = JSON.parse(jsonText);
        console.log(JSON.stringify(j, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}
