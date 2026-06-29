const fetch = require('node-fetch');
const url = 'http://localhost:5001/api/quotes/list/pending?userEmail=electrical@almoayyedcg.com';

async function testFetch() {
    try {
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            console.log('Pending Quotes:', JSON.stringify(data, null, 2));
        } else {
            console.error('Fetch failed:', res.status);
            const text = await res.text();
            console.error('Body:', text);
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

testFetch();
