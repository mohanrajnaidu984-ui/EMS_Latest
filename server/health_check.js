const fetch = require('node-fetch');

async function healthCheck() {
    try {
        const res = await fetch('http://localhost:5001/api/enquiries');
        if (res.ok) {
            console.log('Backend is HEALTHY');
            const data = await res.json();
            console.log('Sample Data Length:', data.length);
        } else {
            console.log('Backend returned ERROR:', res.status);
        }
    } catch (err) {
        console.error('Backend health check FAILED:', err.message);
    }
}

healthCheck();
