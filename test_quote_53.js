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

        const groups = {};
        const options = data.options || [];
        const jobs = data.jobs || [];
        const values = data.values || {};

        console.log(`Found ${options.length} options, ${jobs.length} jobs.`);

        // Simulate deduplication
        const uniqueOptions = [];
        const seenOptions = new Set();
        const activeCustomer = 'TATA PROJECTS'; // From screenshot

        // Normalize helper
        const normalizeCust = (cust) => (cust || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const sortedOptions = [...options].sort((a, b) => {
            const aMatch = normalizeCust(a.customerName) === normalizeCust(activeCustomer);
            const bMatch = normalizeCust(b.customerName) === normalizeCust(activeCustomer);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0;
        });

        sortedOptions.forEach(opt => {
            const key = `${normalizeCust(opt.name)}_${normalizeCust(opt.itemName)}`;
            if (!seenOptions.has(key)) {
                uniqueOptions.push(opt);
                seenOptions.add(key);
            }
        });

        console.log(`Processing ${uniqueOptions.length} unique options.`);

        uniqueOptions.forEach(opt => {
            // Customer Filter
            const optCust = normalizeCust(opt.customerName);
            const activeCust = normalizeCust(activeCustomer);
            const isCustomerMatch = (!opt.customerName || optCust === activeCust || optCust === 'main');

            if (!isCustomerMatch) return;

            let optionTotal = 0;

            // Jobs Loop
            jobs.forEach(job => {
                // Key Logic
                const key = `${opt.id}_${job.id}`;
                let val = values[key];
                let price = val ? parseFloat(val.Price || 0) : 0;

                if (price > 0) {
                    // Check if job matches option itemName
                    const optItemName = (opt.itemName || '').toLowerCase().trim();
                    const jobItemName = (job.itemName || '').toLowerCase().trim();

                    // Simple match logic (simplified from actual component)
                    // If opt.itemName is null, it's global? Usually it's bound to a job.
                    let isMatch = false;
                    if (!opt.itemName) isMatch = true;
                    else if (optItemName === 'lead job' && job.isLead) isMatch = true;
                    else if (optItemName === jobItemName) isMatch = true;
                    else if (job.itemName.toLowerCase().includes(optItemName)) isMatch = true; // Partial match logic used in component?

                    if (isMatch) {
                        console.log(`  Adding ${price} for ${opt.name} (Job: ${job.itemName})`);
                        optionTotal += price;
                    }
                }
            });

            if (optionTotal > 0) {
                let groupName = opt.itemName || 'Generald';
                if (!groups[groupName]) groups[groupName] = { total: 0, items: [] };
                groups[groupName].items.push({ name: opt.name, total: optionTotal });
                groups[groupName].total += optionTotal;
            }
        });

        console.log('\n--- Summary Groups ---');
        Object.keys(groups).forEach(g => {
            console.log(`Group: ${g}`);
            console.log(`  Total: ${groups[g].total}`);
            groups[g].items.forEach(i => console.log(`    - ${i.name}: ${i.total}`));
        });

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) console.error(error.response.data);
    }
}

testQuoteSummary();
