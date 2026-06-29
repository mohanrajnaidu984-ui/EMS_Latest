const http = require('http');

const cxName = "SEPCO III Electric Power Construction Co. Ltd.";
const url = `http://localhost:5001/api/pricing/51?userEmail=electrical@almoayyedcg.com&customerName=${encodeURIComponent(cxName)}`;

console.log('Fetching:', url);

const req = http.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('ActiveCustomer Type:', typeof json.activeCustomer, 'Value:', json.activeCustomer);
            if (json.values && Array.isArray(json.values)) {
                json.values.slice(0, 5).forEach((v, i) => {
                    console.log(`Val[${i}] CustName Type:`, typeof v.CustomerName, 'Value:', v.CustomerName);
                });
            } else {
                console.log('No values array');
            }
        } catch (e) {
            console.error('Parse Error:', e.message);
        }
    });
});

req.on('error', (e) => {
    console.error('Request Error:', e.message);
});
