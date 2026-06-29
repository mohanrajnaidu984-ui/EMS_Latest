
const { connectDB, sql } = require('./dbConfig');
require('dotenv').config();

async function run() {
    try {
        await connectDB();
        const requestNo = '42';

        console.log('--- Fetching Data with Left Join ---');
        // Mimic the query in route
        const rawItemsResult = await sql.query`
                SELECT EF.ID, EF.ParentID, EF.ItemName, MEF.CommonMailIds, MEF.CCMailIds 
                FROM EnquiryFor EF
                LEFT JOIN Master_EnquiryFor MEF ON EF.ItemName = MEF.ItemName
                WHERE EF.RequestNo = ${requestNo}`;
        const rawItems = rawItemsResult.recordset;

        console.log(`Total Items: ${rawItems.length}`);

        // Check BMS Item specifically
        const bmsItem = rawItems.find(r => r.ItemName.includes('BMS - ELV'));
        if (bmsItem) {
            console.log('Found BMS Item:', bmsItem);
        } else {
            console.log('BMS Item Not Found in Result!');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}
run();
