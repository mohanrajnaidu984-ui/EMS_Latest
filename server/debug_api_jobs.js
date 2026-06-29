const http = require('http');

const items = ["Civil Project", "Electrical", "BMS"];

// Using 'Civil Project' as customer. User is 'electrical'.
const url = `http://localhost:5001/api/pricing/51?userEmail=electrical@almoayyedcg.com&customerName=${encodeURIComponent('Civil Project')}`;

console.log('Fetching:', url);

const req = http.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('API Response Status:', res.statusCode);

            if (json.jobs && Array.isArray(json.jobs)) {
                console.log(`Jobs Count: ${json.jobs.length}`);
                const names = json.jobs.map(j => `[${j.ID}] ${j.ItemName} (P:${j.ParentID})`);
                console.log('Jobs Found:', names);

                const hasBMS = json.jobs.some(j => j.ItemName.includes('BMS'));
                console.log('Has BMS job?', hasBMS);
            } else {
                console.log('No jobs array in response');
            }
        } catch (e) {
            console.error('Parse Error:', e.message);
            console.log('Raw:', data.substring(0, 200));
        }
    });
});

req.on('error', (e) => {
    console.error('Request Error:', e.message);
});
