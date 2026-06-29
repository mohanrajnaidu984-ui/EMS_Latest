const http = require('http');

async function checkPricingApi() {
    const enqNo = 15;
    const userEmail = 'civil@almoayyedcg.com'; // Civil user for Enquiry 15
    const url = `http://localhost:5001/api/pricing/${enqNo}?userEmail=${encodeURIComponent(userEmail)}`;

    console.log('Fetching:', url);

    http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                console.log('customers:', json.customers);
                console.log('extraCustomers:', json.extraCustomers);
            } catch (e) {
                console.error('Parse Error:', e.message);
                console.log('Raw Data:', data.substring(0, 500));
            }
        });
    }).on('error', (err) => {
        console.error('HTTP Error:', err.message);
    });
}

checkPricingApi();
