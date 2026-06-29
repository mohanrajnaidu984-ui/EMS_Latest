const { sql, connectDB } = require('./dbConfig');

async function simulatePricingQuery() {
    await connectDB();
    try {
        const userEmail = 'electrical@almoayyedcg.com';

        // Step 1: Get user details
        console.log('=== STEP 1: Get User Details ===');
        const userRes = await sql.query`SELECT FullName, Roles FROM Master_ConcernedSE WHERE EmailId = ${userEmail}`;
        const user = userRes.recordset[0];
        console.log('User:', user);
        const userFullName = user ? user.FullName : '';
        const isAdmin = user && user.Roles === 'Admin';
        console.log('Is Admin?', isAdmin);

        // Step 2: Fetch Enquiry 45
        console.log('\n=== STEP 2: Fetch Enquiry 45 ===');
        const enqRes = await sql.query`
            SELECT RequestNo, ProjectName, CustomerName, Status
            FROM EnquiryMaster
            WHERE RequestNo = '45'
            AND (Status IN ('Open', 'Enquiry', 'Priced', 'Estimated', 'Quote') OR Status IS NULL OR Status = '')
        `;
        console.log('Enquiry found?', enqRes.recordset.length > 0);
        if (enqRes.recordset.length > 0) {
            console.log('Enquiry:', enqRes.recordset[0]);
        }

        // Step 3: Get Jobs for Enquiry 45
        console.log('\n=== STEP 3: Get Jobs ===');
        const jobsRes = await sql.query`
            SELECT EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName, 
                   MEF.CommonMailIds, MEF.CCMailIds
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo = '45'
        `;
        console.log('Jobs found:', jobsRes.recordset.length);
        jobsRes.recordset.forEach(job => {
            console.log(`  - ${job.ItemName} | Common: ${job.CommonMailIds} | CC: ${job.CCMailIds}`);
        });

        // Step 4: Check which jobs match the user
        console.log('\n=== STEP 4: Match User to Jobs ===');
        const myJobs = [];
        jobsRes.recordset.forEach(job => {
            const emails = [job.CommonMailIds, job.CCMailIds].filter(Boolean).join(',');
            const emailsLower = emails.toLowerCase();
            const userEmailLower = userEmail.toLowerCase();
            const userEmailUsername = userEmailLower.split('@')[0];

            const isMatch = emailsLower.includes(userEmailLower) ||
                emailsLower.split(',').some(e => e.trim() === userEmailUsername);

            if (isMatch) {
                myJobs.push(job);
                console.log(`  ✓ MATCH: ${job.ItemName}`);
            } else {
                console.log(`  ✗ NO MATCH: ${job.ItemName}`);
            }
        });

        console.log('\nTotal matched jobs:', myJobs.length);

        // Step 5: Check pricing values
        console.log('\n=== STEP 5: Check Pricing Values ===');
        const pricesRes = await sql.query`
            SELECT EnquiryForID, EnquiryForItem, Price
            FROM EnquiryPricingValues
            WHERE RequestNo = '45'
        `;
        console.log('Pricing records:', pricesRes.recordset.length);
        pricesRes.recordset.forEach(p => {
            console.log(`  - ID: ${p.EnquiryForID}, Item: ${p.EnquiryForItem}, Price: ${p.Price}`);
        });

        // Step 6: Check if any items are pending (price = 0)
        let hasPendingItems = false;
        myJobs.forEach(job => {
            const priceRow = pricesRes.recordset.find(p => p.EnquiryForID === job.ID || p.EnquiryForItem === job.ItemName);
            const priceVal = priceRow ? priceRow.Price : 0;
            if (priceVal <= 0) {
                hasPendingItems = true;
                console.log(`  ⚠ PENDING: ${job.ItemName} (Price: ${priceVal})`);
            }
        });

        console.log('\n=== FINAL RESULT ===');
        console.log('Has Pending Items?', hasPendingItems);
        console.log('Should show in list?', myJobs.length > 0 && hasPendingItems);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

simulatePricingQuery();
