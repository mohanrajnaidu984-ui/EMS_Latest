const http = require('http');

const requestNo = 'EYS/2025/11/459';
const url = `http://localhost:5000/api/attachments?requestNo=${encodeURIComponent(requestNo)}`;

console.log(`Fetching from: ${url}`);

http.get(url, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Response Status:', res.statusCode);
        console.log('Response Body:', data);
    });

}).on('error', (err) => {
    console.error('Error:', err.message);
});
