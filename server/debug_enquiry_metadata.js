const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const userEmail = 'electrical@almoayyedcg.com';
const url = `http://localhost:5001/api/quotes/enquiry-data/45?userEmail=${encodeURIComponent(userEmail)}`;

async function test() {
    try {
        const res = await fetch(url);
        const data = await res.json();
        console.log('--- ENQUIRY 45 METADATA ---');
        console.log('Customer Options:', JSON.stringify(data.customerOptions));
        console.log('Available Profiles:', JSON.stringify(data.availableProfiles?.map(p => p.itemName)));
        if (data.divisionsHierarchy) {
            console.log('Divisions Hierarchy (Summary):');
            data.divisionsHierarchy.forEach(d => {
                console.log(`- ID: ${d.id}, Parent: ${d.parentId}, Name: ${d.itemName}`);
            });
        }
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

test();
