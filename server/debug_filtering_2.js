const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const userEmail = 'electrical@almoayyedcg.com';
const url = `http://localhost:5001/api/quotes/enquiry-data/45?userEmail=${encodeURIComponent(userEmail)}`;

async function test() {
    try {
        const res = await fetch(url);
        const data = await res.json();

        console.log('Customer Options (Raw):', data.customerOptions);

        data.divisionsHierarchy.forEach(d => {
            const mails = [d.commonMailIds, d.ccMailIds].filter(Boolean).join(',').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const match = mails.includes(userEmail.toLowerCase());
            console.log(`Node: "${d.itemName}", Emails: "${mails}", Match: ${match}`);
        });

    } catch (err) {
        console.error('Fetch error:', err);
    }
}

test();
