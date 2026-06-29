const { sql, connectDB } = require('./dbConfig');

// Simulate the exact pricing query logic
async function testPricingLogic() {
    await connectDB();

    const userEmail = 'electrical@almoayyedcg.com';

    try {
        // 1. Get user
        const userRes = await sql.query`SELECT FullName, Roles FROM Master_ConcernedSE WHERE EmailId = ${userEmail}`;
        const user = userRes.recordset[0];
        const userFullName = user ? user.FullName : '';
        const isAdmin = user && user.Roles === 'Admin';

        console.log('User:', userFullName, '| Admin:', isAdmin);

        // 2. Get Enquiry 45
        const enqRes = await sql.query`
            SELECT RequestNo, ProjectName, Status
            FROM EnquiryMaster
            WHERE RequestNo = '45'
            AND (Status IN ('Open', 'Enquiry', 'Priced', 'Estimated', 'Quote') OR Status IS NULL OR Status = '')
        `;

        if (enqRes.recordset.length === 0) {
            console.log('ERROR: Enquiry 45 not found or filtered by status!');
            process.exit(1);
        }

        console.log('Enquiry 45 found:', enqRes.recordset[0]);

        // 3. Get jobs
        const jobsRes = await sql.query`
            SELECT EF.ID, EF.ItemName, MEF.CommonMailIds, MEF.CCMailIds
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo = '45'
        `;

        console.log('\nJobs for Enquiry 45:');
        const myJobs = [];

        jobsRes.recordset.forEach(job => {
            const emails = [job.CommonMailIds, job.CCMailIds].filter(Boolean).join(',');
            const emailsLower = emails.toLowerCase();
            const userEmailLower = userEmail.toLowerCase();
            const userEmailUsername = userEmailLower.split('@')[0];

            const isMatch = emailsLower.includes(userEmailLower) ||
                emailsLower.split(',').some(e => e.trim() === userEmailUsername);

            console.log(`  Job: "${job.ItemName}"`);
            console.log(`    CommonMailIds: "${job.CommonMailIds}"`);
            console.log(`    CCMailIds: "${job.CCMailIds}"`);
            console.log(`    Combined emails: "${emails}"`);
            console.log(`    User email: "${userEmail}"`);
            console.log(`    User username: "${userEmailUsername}"`);
            console.log(`    MATCH: ${isMatch}`);

            if (isMatch) {
                myJobs.push(job);
            }
        });

        console.log(`\n=== RESULT ===`);
        console.log(`Total jobs: ${jobsRes.recordset.length}`);
        console.log(`Matched jobs: ${myJobs.length}`);
        console.log(`Should show in list: ${myJobs.length > 0}`);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

testPricingLogic();
