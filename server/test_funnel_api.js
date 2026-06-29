const fs = require('fs');

const run = async () => {
    try {
        const baseUrl = 'http://localhost:5001/api/sales-report/funnel-details';
        const params = new URLSearchParams({
            year: '2026',
            company: 'Almoayyed Air Conditioning',
            division: 'BMS',
            role: 'All', // Assuming default
            probabilityName: 'Very High Chance'
        });

        console.log(`Fetching: ${baseUrl}?${params.toString()}`);
        const res = await fetch(`${baseUrl}?${params.toString()}`);
        console.log(`Status: ${res.status}`);

        let data;
        try {
            data = await res.json();
        } catch (e) {
            data = await res.text();
        }

        console.log(`Data Type: ${typeof data}`);
        if (Array.isArray(data)) {
            console.log(`Data Length: ${data.length}`);
        } else {
            console.log(`Data: ${JSON.stringify(data).substring(0, 200)}...`);
        }

    } catch (err) {
        console.error('Fetch Error:', err);
    }
};

run();
