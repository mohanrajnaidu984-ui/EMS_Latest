const sql = require('mssql');

const config = {
    user: 'bmsuser',
    password: 'bms@acg123',
    server: '151.50.1.116',
    database: 'EMS_DB',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        await sql.connect(config);

        // 1. Fetch Enquiry 51
        const enqRes = await sql.query(`
            SELECT DISTINCT 
                E.RequestNo, E.CustomerName
            FROM EnquiryMaster E
            WHERE E.RequestNo = '51'
        `);
        const enquiries = enqRes.recordset;
        console.log('Enquiry:', enquiries[0]);

        // 2. Fetch Jobs for 51
        const jobsRes = await sql.query(`
            SELECT EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName
            FROM EnquiryFor EF
            WHERE EF.RequestNo = '51'
        `);
        const allJobs = jobsRes.recordset;

        // 3. Fetch Prices for 51
        const pricesRes = await sql.query(`
            SELECT PV.RequestNo, PV.EnquiryForID, PV.EnquiryForItem, PV.Price, PV.UpdatedAt, PO.CustomerName
            FROM EnquiryPricingValues PV
            JOIN EnquiryPricingOptions PO ON PV.OptionID = PO.ID
            WHERE PV.RequestNo = '51'
        `);
        const allPrices = pricesRes.recordset;

        console.log('Total Prices Found:', allPrices.length);
        allPrices.forEach(p => console.log(`Price: ${p.Price}, Cust: ${p.CustomerName}, Item: ${p.EnquiryForItem}, ForID: ${p.EnquiryForID}`));

        // 4. Run Logic
        const mappedEnquiries = enquiries.map(enq => {
            const enqRequestNo = enq.RequestNo?.toString().trim();
            const enqJobs = allJobs.filter(j => j.RequestNo?.toString().trim() == enqRequestNo); // Should be all
            const enqPrices = allPrices.filter(p => p.RequestNo?.toString().trim() == enqRequestNo);

            // Build hierarchy (simplified for flat traversal)
            const flatList = enqJobs; // Just use all jobs for testing key matches

            const subJobPrices = flatList.map(job => {
                if (!job.ItemName.includes('Electrical')) return null; // Focus on Electrical

                console.log(`\n--- Eval Job: ${job.ItemName} (${job.ID}) ---`);

                // Filter matching prices by Job ID or Name
                const matches = enqPrices.filter(p =>
                    (p.EnquiryForID && p.EnquiryForID == job.ID) ||
                    (p.EnquiryForItem && p.EnquiryForItem.toString().trim() == job.ItemName.toString().trim())
                );

                console.log('Matches:', matches.map(m => ({ price: m.Price, cust: m.CustomerName })));

                const activeCustomers = (enq.CustomerName || '').split(',').map(c => c.trim());
                console.log('Active Customers:', activeCustomers);

                // --- LOGIC START ---
                // 1. Try to find VALID price for Main Customer
                let priceRow = matches.find(p => p.Price > 0 && p.CustomerName && activeCustomers.includes(p.CustomerName));
                console.log('Step 1 (Main > 0):', priceRow);

                // 2. If no valid main price, look for ANY valid price
                if (!priceRow) {
                    priceRow = matches.find(p => p.Price > 0);
                    console.log('Step 2 (Any > 0):', priceRow);
                }

                // 3. If no valid price anywhere, fall back to Main Customer placeholder (even if 0)
                if (!priceRow) {
                    priceRow = matches.find(p => p.CustomerName && activeCustomers.includes(p.CustomerName));
                    console.log('Step 3 (Main Placeholder):', priceRow);
                }

                if (!priceRow && matches.length > 0) {
                    // Fallback to Main if available
                    priceRow = matches.find(p => p.CustomerName === 'Main') || matches[0];
                    console.log('Step 4 (Fallback):', priceRow);
                }
                // --- LOGIC END ---

                const priceVal = priceRow ? priceRow.Price : 0;
                return `${job.ItemName}: ${priceVal}`;
            });
            return subJobPrices.filter(x => x);
        });

        console.log('\nFinal Results:', mappedEnquiries);

        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

run();
