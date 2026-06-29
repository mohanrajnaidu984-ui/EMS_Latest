const { sql, connectDB } = require('./dbConfig');

async function checkEnquiry45() {
    await connectDB();
    try {
        // Check Enquiry Status
        const enqRes = await sql.query`SELECT RequestNo, ProjectName, Status FROM EnquiryMaster WHERE RequestNo = '45'`;
        const enq = enqRes.recordset[0];

        if (!enq) {
            console.log('ERROR: Enquiry 45 not found!');
            process.exit(1);
        }

        console.log('Enquiry 45 Status:', enq.Status);

        // Check if status is in the allowed list
        const allowedStatuses = ['Open', 'Enquiry', null, ''];
        const isAllowed = allowedStatuses.includes(enq.Status);
        console.log('Is Status Allowed for Pending List?', isAllowed);

        if (!isAllowed) {
            console.log('\nPROBLEM: Enquiry 45 has status "' + enq.Status + '" which is NOT in the pending filter.');
            console.log('The pricing list only shows enquiries with status: Open, Enquiry, or NULL/empty');
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

checkEnquiry45();
