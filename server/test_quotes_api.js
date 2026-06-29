const fetch = require('node-fetch');

async function testAPI() {
    try {
        console.log('Testing /api/quotes/51 endpoint...');
        const res = await fetch('http://localhost:5001/api/quotes/51');
        console.log('Status:', res.status);
        const data = await res.json();
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error:', err);
    }
}

testAPI();
