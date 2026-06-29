
const http = require('http');

function get(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        }).on('error', err => reject(err));
    });
}

async function testApi() {
    try {
        console.log('Testing /api/sales-report/filters...');
        const result = await get('http://localhost:5000/api/sales-report/filters');

        console.log('Status:', result.status);
        if (result.status === 200) {
            console.log('Data:', result.body);
        } else {
            console.log('Error Body:', result.body);
        }
    } catch (err) {
        console.error('Request Error:', err.message);
    }
}

testApi();
