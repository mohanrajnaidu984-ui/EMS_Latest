const http = require('http');

const url = `http://localhost:5001/api/pricing/51?userEmail=electrical@almoayyedcg.com&customerName=${encodeURIComponent('NOORWOOD')}`;

console.log('Fetching:', url);

const req = http.get(url, (res) => {
    console.log('Status:', res.statusCode);
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.error) console.log('API Error:', json.error);
            else {
                console.log('API Success. Jobs:', json.jobs ? json.jobs.length : 'None');
                if (json.jobs) {
                    const bms = json.jobs.find(j => j.itemName && j.itemName.includes('BMS'));
                    console.log('BMS Job found in response?', !!bms);
                    if (bms) console.log('BMS Visible:', bms.visible);
                }
            }
        } catch (e) {
            console.log('Response Raw (First 500 chars):', data.substring(0, 500));
        }
    });
});

req.on('error', (e) => {
    console.error('Request Error:', e.message);
});
