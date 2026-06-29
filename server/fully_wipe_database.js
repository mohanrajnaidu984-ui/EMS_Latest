const { sql, connectDB } = require('./dbConfig');

async function fullyWipeDatabase() {
    try {
        await connectDB();
        console.log("⚠️  WARNING: Starting COMPLETE database wipe...");

        const request = new sql.Request();

        // 1. Delete Child/Related Tables (Dependencies of EnquiryMaster or Master Tables)
        console.log("Deleting Child/Related Tables...");
        await request.query(`
            DELETE FROM EnquiryPricingValues;
            DELETE FROM EnquiryPricingOptions;
            DELETE FROM EnquiryQuotes;
            DELETE FROM QuoteTemplates;
            DELETE FROM EnquiryNotes;
            DELETE FROM Notifications;
            DELETE FROM Attachments;
            DELETE FROM EnquiryType;
            DELETE FROM EnquiryFor;
            DELETE FROM ReceivedFrom;
            DELETE FROM ConcernedSE;
            DELETE FROM EnquiryCustomer;
        `);

        // 2. Delete Main Transaction Table
        console.log("Deleting EnquiryMaster...");
        await request.query(`
            DELETE FROM EnquiryMaster;
        `);

        // 3. Delete Master Data Tables
        console.log("Deleting Master Data Tables...");
        await request.query(`
            DELETE FROM Master_ConcernedSE;
            DELETE FROM Master_CustomerName;
            DELETE FROM Master_ClientName;
            DELETE FROM Master_ConsultantName;
            DELETE FROM Master_SourceOfEnquiry;
            DELETE FROM Master_EnquiryType;
            DELETE FROM Master_EnquiryFor;
            DELETE FROM Master_ReceivedFrom;
            DELETE FROM Master_AdditionalEmails;
        `);

        console.log("✅ FULL Database wipe completed. All tables are empty.");

        await sql.close();
        process.exit(0);

    } catch (err) {
        console.error("❌ Error wiping database:", err);
        process.exit(1);
    }
}

fullyWipeDatabase();
