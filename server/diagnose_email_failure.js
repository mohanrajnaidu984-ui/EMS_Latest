const { connectDB, sql } = require('./dbConfig');

async function diagnose() {
    try {
        await connectDB();
        console.log('Connected to DB. Fetching latest enquiry...');

        const res = await sql.query`SELECT TOP 1 * FROM EnquiryMaster ORDER BY CreatedAt DESC`;
        if (res.recordset.length === 0) {
            console.log('No enquiries found.');
            return;
        }

        const enq = res.recordset[0];
        console.log('--- Latest Enquiry ---');
        console.log(`RequestNo: ${enq.RequestNo}`);
        console.log(`Created At: ${enq.CreatedAt}`);
        console.log(`AutoAck (SendAcknowledgementMail): ${enq.SendAcknowledgementMail}`);
        console.log(`AcknowledgementSE: ${enq.AcknowledgementSE}`);

        // Check Received From
        const recvRes = await sql.query`SELECT * FROM ReceivedFrom WHERE RequestNo = ${enq.RequestNo}`;
        console.log(`\nLinked 'Received From' Contacts (${recvRes.recordset.length}):`);

        for (const contact of recvRes.recordset) {
            console.log(`- Contact: ${contact.ContactName}, Company: ${contact.CompanyName}`);

            // Check Master Email
            const masterRes = await sql.query`SELECT EmailId FROM Master_ReceivedFrom WHERE ContactName = ${contact.ContactName} AND CompanyName = ${contact.CompanyName}`;
            if (masterRes.recordset.length > 0) {
                console.log(`  -> Found in Master. Email: '${masterRes.recordset[0].EmailId}'`);
            } else {
                console.log(`  -> NOT FOUND in Master_ReceivedFrom! logic will fail to find email.`);
            }
        }

        // Check Ack SE Email
        if (enq.AcknowledgementSE) {
            const seRes = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE FullName = ${enq.AcknowledgementSE}`;
            if (seRes.recordset.length > 0) {
                console.log(`\nAcknowledgementSE (${enq.AcknowledgementSE}) Email: '${seRes.recordset[0].EmailId}'`);
            } else {
                console.log(`\nAcknowledgementSE (${enq.AcknowledgementSE}) NOT FOUND in Master_ConcernedSE or has no email.`);
            }
        } else {
            console.log('\nNo AcknowledgementSE set.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        // process.exit(0); // Don't exit immediately, let async finish? MSSQL usually needs explicit close or just hang.
        // For script, exit is fine.
        setTimeout(() => process.exit(0), 1000);
    }
}

diagnose();
