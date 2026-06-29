const { sql, connectDB } = require('./dbConfig');

async function clearDatabase() {
    try {
        await connectDB();

        console.log("Starting database cleanup...");

        // 1. Clear Transaction Tables (Child tables first due to Foreign Keys)
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

        // OPTIONAL: Clear Master Data Tables (Uncomment if you want to wipe dropdown options too)
        /*
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
        */

        console.log("Database cleanup completed successfully!");
        console.log("Note: Master data (dropdown options) were NOT deleted to preserve configuration.");

        await sql.close();
    } catch (err) {
        console.error("Error clearing database:", err);
    }
}

clearDatabase();
