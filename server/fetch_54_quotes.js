
const axios = require('axios');
axios.get('http://localhost:5001/api/quotes/by-enquiry/54')
    .then(res => {
        console.log('Quotes for Enquiry 54:');
        console.log(JSON.stringify(res.data, null, 2));
    })
    .catch(err => {
        console.error('Error fetching quotes:', err.message);
    });
