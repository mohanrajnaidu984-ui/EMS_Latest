const axios = require('axios');

async function testApi() {
    try {
        const res = await axios.get('http://localhost:5001/api/quotes/by-enquiry/54');
        console.log('API Response for by-enquiry/54:');
        console.log(`Status: ${res.status}`);
        console.log(`Count: ${res.data.length}`);
        res.data.forEach(q => {
            console.log(`  - ${q.QuoteNumber} | To: ${q.ToName}`);
        });
    } catch (err) {
        console.error('API Call Failed:', err.message);
    }
}

testApi();
