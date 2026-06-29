const { sql, connectDB } = require('./dbConfig');

async function checkEnquiry45() {
    await connectDB();
    try {
        const enqRes = await sql.query`SELECT RequestNo, ProjectName, Status FROM EnquiryMaster WHERE RequestNo = '45'`;
        const enq = enqRes.recordset[0];

        if (!enq) {
            console.log('ERROR: Enquiry 45 not found!');
        } else {
            console.log('Enquiry 45 Status: "' + enq.Status + '"');
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

checkEnquiry45();
