
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
        const result = await get('http://localhost:5000/api/sales-report/filters');
        if (result.status === 200) {
            const json = JSON.parse(result.body);
            console.log('Keys:', Object.keys(json));
            console.log('Years count:', json.years.length);
            console.log('Companies count:', json.companies.length);
            console.log('Divisions count:', json.divisions.length);
            console.log('Roles count:', json.roles.length);
        } else {
            console.log('Error:', result.status);
        }
    } catch (err) {
        console.error(err.message);
    }
}

testApi();
