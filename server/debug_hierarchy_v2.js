
const { connectDB, sql } = require('./dbConfig');
require('dotenv').config();

async function run() {
    try {
        await connectDB();
        const requestNo = '42';

        // Fetch raw items with Hierarchy
        const rawItemsResult = await sql.query`SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        const rawItems = rawItemsResult.recordset;

        console.log('--- Hierarchy Dump ---');
        rawItems.forEach(r => {
            const parent = rawItems.find(p => p.ID === r.ParentID);
            console.log(`${r.ID} (${r.ItemName}) -> Parent: ${r.ParentID} (${parent ? parent.ItemName : 'ROOT'})`);
        });

        console.log('\n--- Analysis ---');
        // Find BMS
        const bmsItems = rawItems.filter(r => r.ItemName.includes('BMS'));
        bmsItems.forEach(bms => {
            console.log(`BMS Item: ${bms.ItemName} (${bms.ID})`);
            let curr = bms;
            let path = [];
            while (curr) {
                path.push(curr.ItemName);
                curr = rawItems.find(p => p.ID === curr.ParentID);
            }
            console.log(`Path to Root: ${path.join(' -> ')}`);
        });

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}
run();
