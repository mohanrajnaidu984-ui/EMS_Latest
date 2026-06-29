const axios = require('axios');
const fs = require('fs');

async function checkApi() {
    try {
        const bmsRes = await axios.get('http://localhost:5001/api/pricing/16?userEmail=bmselveng1@almoayyedcg.com');
        fs.writeFileSync('debug16_bms.json', JSON.stringify(bmsRes.data, null, 2));

        const elecRes = await axios.get('http://localhost:5001/api/pricing/16?userEmail=electrical@almoayyedcg.com');
        fs.writeFileSync('debug16_elec.json', JSON.stringify(elecRes.data, null, 2));

        console.log('API data saved');
    } catch (err) {
        console.error(err);
    }
}

checkApi();
