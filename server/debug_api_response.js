const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const userEmail = 'electrical@almoayyedcg.com';
const url = `http://localhost:5001/api/quotes/list/pending?userEmail=${encodeURIComponent(userEmail)}`;

async function test() {
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.length > 0) {
            console.log('Keys:', Object.keys(data[0]));
            console.log('Full JSON of first item:', JSON.stringify(data[0], null, 2));
        }
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

test();
