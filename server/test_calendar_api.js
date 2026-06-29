const axios = require('axios');
const fs = require('fs');

async function testCalendarApi() {
    try {
        const response = await axios.get('http://localhost:5001/api/dashboard/calendar', {
            params: {
                month: 2,
                year: 2026,
                division: 'All',
                salesEngineer: 'Electrical',
                userRole: 'Admin' // Using Admin to simplify access control for now
            }
        });
        fs.writeFileSync('calendar_api_results.json', JSON.stringify(response.data, null, 2));
        console.log('Results written to calendar_api_results.json');

        const feb18 = (response.data.daily || []).find(d => d.Date.startsWith('2026-02-18'));
        console.log('Feb 18 data:', JSON.stringify(feb18, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }
}

testCalendarApi();
