const http = require('http');

http.get('http://localhost:5001/api/pricing/list/pending?userEmail=electrical@almoayyedcg.com', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const json = JSON.parse(data);
        const item18 = json.find(j => j.RequestNo === '18');
        console.log('Enquiry 18 from Pricing API:', item18);
    });
}).on('error', err => console.error(err));
