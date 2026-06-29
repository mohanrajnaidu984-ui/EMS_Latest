
const axios = require('axios');
const userEmail = 'bmselveng1@almoayyedcg.com';
const enquiryNo = '55';

axios.get(`http://localhost:5001/api/pricing/${enquiryNo}?userEmail=${userEmail}`)
    .then(res => {
        console.log('Pricing Data for 55:');
        const data = res.data;
        console.log('Options:', data.options.map(o => ({ id: o.id, name: o.name, itemName: o.itemName, customerName: o.customerName })));
        console.log('Jobs:', data.jobs.map(j => ({ id: j.id, itemName: j.itemName, parentId: j.parentId })));

        // Check for duplicate Base Price values
        const values = data.values || [];
        console.log('Values count:', values.length);
        const basePriceOptions = data.options.filter(o => o.name === 'Base Price');
        basePriceOptions.forEach(opt => {
            const optValues = values.filter(v => v.OptionID === opt.id);
            console.log(`Values for Option ${opt.id} (${opt.name}):`, optValues.map(v => ({ job: v.EnquiryForID, price: v.Price, customer: v.CustomerName })));
        });
    })
    .catch(err => {
        console.error('Error:', err.message);
    });
