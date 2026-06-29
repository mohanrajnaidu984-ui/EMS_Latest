const fetch = require('node-fetch');

const test = async () => {
    try {
        const url = 'http://localhost:5001/api/sales-report/funnel-details?year=2026&probabilityName=Very%20High%20Chance';
        const res = await fetch(url);
        const data = await res.json();
        console.log("JSON_START");
        console.log(JSON.stringify(data[0].jobs, null, 2));
        console.log("JSON_END");
    } catch (err) {
        console.error(err);
    }
};

test();
