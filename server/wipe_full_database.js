const { sql, connectDB } = require('./dbConfig');

async function wipeFullDatabase() {
    try {
        await connectDB();

        console.log("WARNING: Starting FULL database wipe (Including Master Data)...");

        // 1. Clear Transaction Tables (Child tables first)
        console.log("Clearing Transaction Tables...");
        await new sql.Request().query(`
            DELETE FROM EnquiryType;
            DELETE FROM EnquiryFor;
            DELETE FROM ReceivedFrom;
            DELETE FROM ConcernedSE;
            DELETE FROM EnquiryCustomer;
            DELETE FROM Attachments;
        `);

        // 2. Clear Main Enquiry Table
        console.log("Clearing Enquiry Master Table...");
        await new sql.Request().query(`
            DELETE FROM EnquiryMaster;
        `);

        // 3. Clear Master Data Tables
        console.log("Clearing Master Data Tables...");
        await new sql.Request().query(`
            DELETE FROM Master_SourceOfEnquiry;
            DELETE FROM Master_EnquiryType;
            DELETE FROM Master_EnquiryFor;
            DELETE FROM Master_ReceivedFrom;
            DELETE FROM Master_ConcernedSE;
            DELETE FROM Master_CustomerName;
            DELETE FROM Master_ClientName;
            DELETE FROM Master_ConsultantName;
        `);

        console.log("FULL Database wipe completed. All tables are now empty.");

        await sql.close();
    } catch (err) {
        console.error("Error wiping database:", err);
    }
}

wipeFullDatabase();
