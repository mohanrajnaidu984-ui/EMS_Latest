const http = require('http');

http.get('http://localhost:5000/api/sales-report/summary?year=2026', (resp) => {
    let data = '';

    resp.on('data', (chunk) => {
        data += chunk;
    });

    resp.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Keys:', Object.keys(json));
            if (json.itemWiseStats) {
                console.log('itemWiseStats length:', json.itemWiseStats.length);
                console.log('Sample:', JSON.stringify(json.itemWiseStats[0]));
            } else {
                console.log('itemWiseStats MISSING');
            }
        } catch (e) {
            console.log('Error parsing JSON:', e.message);
            console.log('Raw data:', data.substring(0, 100));
        }
    });

}).on("error", (err) => {
    console.log("Error: " + err.message);
});
