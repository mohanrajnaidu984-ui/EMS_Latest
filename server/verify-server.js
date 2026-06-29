const express = require('express');
const app = express();
const PORT = 5000;

console.log('Starting test server...');
try {
    const server = app.listen(PORT, () => {
        console.log(`Test Server running on port ${PORT}`);
    });
    console.log('Listen called');

    server.on('error', (e) => {
        console.error('Server error:', e);
    });
} catch (err) {
    console.error('Sync error:', err);
}
