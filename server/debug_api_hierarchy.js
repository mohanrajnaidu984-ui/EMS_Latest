const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const userEmail = 'electrical@almoayyedcg.com';
const url = `http://localhost:5001/api/quotes/enquiry-data/45?userEmail=${encodeURIComponent(userEmail)}`;

async function test() {
    try {
        const res = await fetch(url);
        const data = await res.json();

        console.log('--- ENQUIRY 45 HIERARCHY DATA ---');
        data.divisionsHierarchy.forEach(d => {
            console.log(`Node: "${d.itemName}"`);
            console.log(` - IDs: ID=${d.id}, ParentID=${d.parentId}`);
            console.log(` - CommonMails: "${d.commonMailIds}"`);
            console.log(` - CCMails: "${d.ccMailIds}"`);
        });

    } catch (err) {
        console.error('Fetch error:', err);
    }
}

test();
