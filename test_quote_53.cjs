const axios = require('axios');

async function testQuoteSummary() {
    try {
        console.log('Fetching data for Enquiry 53...');
        const response = await axios.post('http://localhost:5001/api/enquiry-data', {
            enquiryId: 53,
            user: {
                name: 'TestUser',
                role: 'admin',
                scope: ['L1 - Civil Project', 'L1 - BMS', 'L1 - Electrical']
            }
        });

        const data = response.data;
        console.log('Data fetched. Calculating summary...');

        // LOGIC FROM Step 425 ViewFile (simplified)
        // Groups Logic

        const options = data.options || [];
        const jobs = data.jobs || [];
        const values = data.values || {};

        console.log(`Found ${jobs.length} jobs.`);
        jobs.forEach(j => {
            console.log(`Job: ${j.itemName} (ID: ${j.id}) [Parent: ${j.parentId}]`);
        });

        // Loop through options
        const summary = {};

        options.forEach(opt => {
            // console.log(`Option: ${opt.name} (${opt.itemName})`);

            // Check for price for this option across all jobs
            jobs.forEach(job => {
                const key = `${opt.id}_${job.id}`;
                const val = values[key];

                if (val && parseFloat(val.Price) > 0) {
                    const price = parseFloat(val.Price);
                    console.log(`  Found Price: ${price} for Option ${opt.name} on Job ${job.itemName}`);

                    // Add to Job Summary?
                    // In QuoteForm, it loops options and sums matching jobs.

                    // Simple grouping by Job Name
                    if (!summary[job.itemName]) summary[job.itemName] = 0;
                    summary[job.itemName] += price;
                }
            });
        });

        console.log('\n--- Simple Calculation Summary ---');
        Object.keys(summary).forEach(k => {
            console.log(`${k}: ${summary[k]}`);
        });

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testQuoteSummary();
