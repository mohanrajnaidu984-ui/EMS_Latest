const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src', 'components', 'Quote', 'QuoteForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const fetchMarker = 'const pricingRes = await fetch(url);';

if (content.includes(fetchMarker) && !content.includes('[Pricing Fetch]')) {
    // Inject Pre-Fetch Log
    content = content.replace(fetchMarker,
        `console.log('[Pricing Fetch] Requesting:', url, 'ActiveCustomer:', cxName);\n` + fetchMarker
    );

    // Inject Post-JSON Log
    const jsonMarker = 'const pData = await pricingRes.json();';
    content = content.replace(jsonMarker,
        jsonMarker + `\nconsole.log('[Pricing Fetch] Response:', pData.jobs ? pData.jobs.length + ' jobs' : 'No jobs', 'Visible:', pData.jobs ? pData.jobs.map(j => j.itemName + ':' + j.visible) : 'N/A');`
    );

    // Inject Catch Log
    const catchMarker = /} catch \(err\) {/g; // Regex for precise match? No, simpler string
    // Finding the specific catch block for loadPricingData is tricky with replace.
    // Assuming indentation patterns...
    const specificCatch = '} catch (err) {\n            console.error(\'Error loading pricing:\', err);';
    content = content.replace(specificCatch,
        `} catch (err) {\n            console.error('[Pricing Fetch] CRITICAL ERROR:', err);\n            console.error('Error loading pricing:', err);`
    );

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Added detailed fetch logs.');
} else {
    console.log('Fetch marker not found or logs already exist.');
}
