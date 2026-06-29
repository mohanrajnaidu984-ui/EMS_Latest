const axios = require('axios');

async function test() {
    try {
        const response = await axios.get('http://localhost:5001/api/pricing/list/pending?userEmail=bmselveng@almayaedgc.com');
        console.log('Response:', response.data);
    } catch (error) {
        if (error.response) {
            console.error('Error Status:', error.response.status);
            console.error('Error Data:', error.response.data);
        } else {
            console.error('Error Message:', error.message);
        }
    }
}

test();
