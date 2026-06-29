const fetch = require('node-fetch');

async function test() {
    try {
        const response = await fetch('http://localhost:5000/api/sales-report/summary?year=2026&division=BMS');
        const data = await response.json();
        console.log("Sales Report Summary Response:");
        console.log(JSON.stringify(data, null, 2));
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

test();
