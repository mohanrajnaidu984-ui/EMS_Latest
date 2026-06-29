const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');
const userEmail = 'electrical@almoayyedcg.com';
const url = `http://localhost:5001/api/quotes/enquiry-data/45?userEmail=${encodeURIComponent(userEmail)}`;

async function test() {
    try {
        const res = await fetch(url);
        const data = await res.json();

        let output = '--- ENQUIRY 45 HIERARCHY ---\n';
        data.divisionsHierarchy.forEach(d => {
            const mails = [d.commonMailIds, d.ccMailIds].filter(Boolean).join(',').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const match = mails.includes(userEmail.toLowerCase());
            output += `Node: "${d.itemName}" (ID: ${d.id}, Parent: ${d.parentId}), Emails: "${mails}", Match: ${match}\n`;
        });

        output += '\n--- AVAILABLE PROFILES ---\n';
        output += JSON.stringify(data.availableProfiles.map(p => p.itemName)) + '\n';

        fs.writeFileSync('debug_civil_output.txt', output);
        console.log('Done writing to debug_civil_output.txt');
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

test();
