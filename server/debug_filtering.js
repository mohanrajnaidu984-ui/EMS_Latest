const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const userEmail = 'electrical@almoayyedcg.com';
const url = `http://localhost:5001/api/quotes/enquiry-data/45?userEmail=${encodeURIComponent(userEmail)}`;

async function test() {
    try {
        const res = await fetch(url);
        const data = await res.json();

        console.log('--- DATA DUMP ---');
        console.log('Customer Options (Raw):', data.customerOptions);
        console.log('Divisions Hierarchy:');
        data.divisionsHierarchy.forEach(d => {
            console.log(`- ${d.itemName} (ID: ${d.id}, Parent: ${d.parentId}) Emails: ${d.commonMailIds}`);
        });

        const normalizedUser = userEmail.toLowerCase();
        const userPrefix = normalizedUser.split('@')[0];

        const userAccessDivisions = new Set();
        data.divisionsHierarchy.forEach(d => {
            const mails = [d.commonMailIds, d.ccMailIds].filter(Boolean).join(',').toLowerCase();
            if (mails.includes(normalizedUser) || (userPrefix && mails.split(',').some(m => m.trim().startsWith(userPrefix + '@')))) {
                const cleanName = d.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                userAccessDivisions.add(d.itemName.toLowerCase());
                userAccessDivisions.add(cleanName.toLowerCase());
            }
        });

        console.log('User Access Divisions:', Array.from(userAccessDivisions));

    } catch (err) {
        console.error('Fetch error:', err);
    }
}

test();
