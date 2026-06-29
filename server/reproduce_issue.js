const { connectDB, sql } = require('./dbConfig');

async function run() {
    console.log('Starting troubleshooting script...');
    try {
        await connectDB();
        console.log('Database connected.');

        const requestNo = '11';
        const userNameLike = '%Lakshman%';

        // 1. Get User
        console.log(`\n1. Finding User '${userNameLike}'...`);
        const userRes = await sql.query`SELECT ID, FullName, EmailId, Roles FROM Master_ConcernedSE WHERE FullName LIKE ${userNameLike}`;

        if (userRes.recordset.length === 0) {
            console.error('CRITICAL: User Lakshman NOT found!');
            process.exit(1);
        }
        const user = userRes.recordset[0];
        console.log(`User: ${user.FullName} | Email: ${user.EmailId} | Role: ${user.Roles}`);

        // 2. Get Enquiry
        console.log(`\n2. Finding Enquiry '${requestNo}'...`);
        const enqRes = await sql.query`SELECT RequestNo, CreatedBy FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;

        if (enqRes.recordset.length === 0) {
            console.error('CRITICAL: Enquiry 11 NOT found!');
            process.exit(1);
        }
        const enquiry = enqRes.recordset[0];
        console.log(`Enquiry CreatedBy: '${enquiry.CreatedBy}'`);

        const isCreator = (enquiry.CreatedBy && user.FullName && enquiry.CreatedBy.trim().toLowerCase() === user.FullName.trim().toLowerCase());
        console.log(`Is User the Creator? ${isCreator}`);


        // Check ConcernedSE
        const cseRes = await sql.query`SELECT * FROM ConcernedSE WHERE RequestNo = ${requestNo} AND SEName = ${user.FullName}`;
        const isConcernedSE = cseRes.recordset.length > 0;
        console.log(`Is User a Concerned SE? ${isConcernedSE}`);

        // 3. Get Jobs & Email Assignments
        console.log(`\n3. Checking Job Assignments for Enquiry '${requestNo}'...`);

        const jobsRes = await sql.query`
            SELECT ef.ID, ef.ItemName, ef.ParentID, mef.CommonMailIds, mef.CCMailIds
            FROM EnquiryFor ef
            LEFT JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
            WHERE ef.RequestNo = ${requestNo}
        `;

        const rawJobs = jobsRes.recordset;
        // Polyfill
        const jobs = rawJobs.map(job => {
            const parent = rawJobs.find(p => p.ID === job.ParentID);
            return { ...job, ParentItemName: parent ? parent.ItemName : null };
        });
        console.log(`Found ${jobs.length} jobs.`);

        let emailMatchedJobs = [];
        const userEmailLower = user.EmailId.toLowerCase();

        jobs.forEach(j => {
            console.log(` - Job: ${j.ItemName} (ID: ${j.ID}, ParentID: ${j.ParentID}) -> ParentName: ${j.ParentItemName}`);
        });

        if (isConcernedSE) {
            console.log('User is Concerned SE -> Should have read access.');
        }

        if (isCreator) {
            console.log('User is Creator -> Granting Full Visibility (simulated)');
            emailMatchedJobs = jobs.map(j => j.ItemName);
        }

        jobs.forEach(j => {
            const mails = [
                ...(j.CommonMailIds || '').split(','),
                ...(j.CCMailIds || '').split(',')
            ].map(m => m.trim().toLowerCase()).filter(Boolean);

            if (mails.includes(userEmailLower)) {
                console.log(`MATCH: User assigned to '${j.ItemName}' via email.`);
                emailMatchedJobs.push(j.ItemName);
            }
        });

        if (emailMatchedJobs.length === 0) {
            console.log('WARNING: User is NOT assigned to any jobs via email.');
        } else {
            console.log(`User mapped to jobs: ${emailMatchedJobs.join(', ')}`);
        }

        // 4. Conclusion
        if (!isCreator && emailMatchedJobs.length === 0 && user.Roles !== 'Admin') {
            console.log('\nCONCLUSION: User has NO ACCESS. This explains why data is not retrieving.');
        } else {
            console.log('\nCONCLUSION: User SHOULD have access. Further debugging of Hierarchy logic needed.');
        }

    } catch (err) {
        console.error('Script Error:', err);
    } finally {
        process.exit();
    }
}

run();
