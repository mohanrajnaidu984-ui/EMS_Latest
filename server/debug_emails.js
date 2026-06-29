
const { connectDB, sql } = require('./dbConfig');
require('dotenv').config();

async function run() {
    try {
        await connectDB();
        const requestNo = '42';

        console.log('--- Fetching Data ---');
        const rawItemsResult = await sql.query`
            SELECT ID, ParentID, ItemName, CommonMailIds, CCMailIds 
            FROM EnquiryFor 
            WHERE RequestNo = ${requestNo}`;
        const rawItems = rawItemsResult.recordset;

        console.log(`Total Items: ${rawItems.length}`);
        rawItems.forEach(r => {
            console.log(`[${r.ID}] ${r.ItemName}`);
            console.log(`    Common: ${r.CommonMailIds}`);
            console.log(`    CC: ${r.CCMailIds}`);
        });

        // Test Logic
        // Simulate a User Email - I need to pick one from the output to test
        // But for now let's just dump.

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}
run();
