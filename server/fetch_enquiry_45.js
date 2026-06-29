const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');
const userEmail = 'electrical@almoayyedcg.com';
const url = `http://localhost:5001/api/quotes/enquiry-data/45?userEmail=${encodeURIComponent(userEmail)}`;

async function test() {
    try {
        const res = await fetch(url);
        const data = await res.json();
        fs.writeFileSync('full_enquiry_data_45.json', JSON.stringify(data, null, 2));
        console.log('Saved to full_enquiry_data_45.json');
    } catch (err) {
        console.error(err);
    }
}

test();
