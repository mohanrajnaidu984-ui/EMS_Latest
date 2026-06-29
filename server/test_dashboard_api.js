const axios = require('axios');
const fs = require('fs');

async function checkDashboardApi() {
    try {
        const response = await axios.get('http://localhost:5001/api/dashboard/enquiries', {
            params: {
                search: '52',
                userRole: 'Admin'
            }
        });
        fs.writeFileSync('dashboard_52_results.txt', JSON.stringify(response.data, null, 2));
        console.log('Results written to dashboard_52_results.txt');
    } catch (err) {
        fs.writeFileSync('dashboard_52_results.txt', 'Error: ' + err.message);
    }
}

checkDashboardApi();
