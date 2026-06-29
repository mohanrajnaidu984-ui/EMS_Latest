const http = require('http');

async function checkApi() {
    const enqNo = 14;
    const userEmail = 'electrical@almoayyedcg.com';
    const url = `http://localhost:5001/api/quotes/enquiry-data/${enqNo}?userEmail=${encodeURIComponent(userEmail)}`;

    console.log('Fetching:', url);

    http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                console.log('userIsSubjobUser:', json.userIsSubjobUser);
                console.log('customerOptions:', json.customerOptions);
                console.log('divisionsHierarchy count:', json.divisionsHierarchy ? json.divisionsHierarchy.length : 'N/A');
                console.log('leadJobPrefix:', json.leadJobPrefix);
            } catch (e) {
                console.error('Parse Error:', e.message);
                console.log('Raw Data:', data.substring(0, 500));
            }
        });
    }).on('error', (err) => {
        console.error('HTTP Error:', err.message);
    });
}

checkApi();
