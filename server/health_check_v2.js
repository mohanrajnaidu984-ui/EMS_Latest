const http = require('http');

http.get('http://localhost:5001/api/enquiries', (res) => {
    console.log('Status:', res.statusCode);
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Backend is HEALTHY. Data length:', Array.isArray(json) ? json.length : 'Object');
        } catch (e) {
            console.log('Backend returned non-JSON:', data.substring(0, 100));
        }
    });
}).on('error', (err) => {
    console.error('Backend health check FAILED:', err.message);
});
