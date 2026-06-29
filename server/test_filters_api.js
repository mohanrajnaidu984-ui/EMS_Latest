
const fetch = require('node-fetch');

async function testApi() {
    try {
        console.log('Testing /api/sales-report/filters...');
        const res = await fetch('http://localhost:5000/api/sales-report/filters');

        if (res.ok) {
            const data = await res.json();
            console.log('Status: 200 OK');
            console.log('Data received:', JSON.stringify(data, null, 2));

            if (data.companies && data.companies.length === 0) {
                console.log('WARNING: Companies array is empty!');
            }
            if (data.divisions && data.divisions.length === 0) {
                console.log('WARNING: Divisions array is empty!');
            }
        } else {
            console.log('Error Status:', res.status, res.statusText);
            const text = await res.text();
            console.log('Body:', text);
        }

    } catch (err) {
        console.error('Fetch error:', err.message);
    }
}

testApi();
