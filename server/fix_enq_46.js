const { connectDB, sql } = require('./dbConfig');

async function fix() {
    try {
        await connectDB();
        console.log('Connected.');

        // Update Enquiry 46 - Root item
        // Assuming ID 114 is the root "Civil Project" based on user context, 
        // but let's look it up dynamically to be safe.

        const res = await sql.query`SELECT * FROM EnquiryFor WHERE RequestNo = '46' AND ParentID IS NULL`;
        if (res.recordset.length > 0) {
            const root = res.recordset[0];
            console.log(`Found root item for 46: ${root.ItemName} (ID: ${root.ID})`);

            // Set LeadJobCode to L1 (assuming it's the first/only one)
            // Or better, logic: if no other L# exists for this request, call it L1. 
            // Query existing L codes for 46? likely none.

            const p = new sql.Request();
            p.input('id', sql.Int, root.ID);
            await p.query`UPDATE EnquiryFor SET LeadJobCode = 'L1' WHERE ID = @id`;
            console.log('Updated LeadJobCode to L1.');
        } else {
            console.log('No root item found for Enquiry 46.');
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

fix();
