const { connectDB, sql } = require('./dbConfig');

async function fixEnquiry50LeadJobCode() {
    try {
        await connectDB();
        const requestNo = '50';

        console.log(`\n--- Fixing LeadJobCode for Enq ${requestNo} ---`);

        // 1. Identify Root Item
        const root = await sql.query`
            SELECT ID, ItemName FROM EnquiryFor 
            WHERE RequestNo = ${requestNo} AND ParentID IS NULL
        `;

        if (root.recordset.length === 0) {
            console.log('No root item found? checking items with ParentID=0 or empty strings?');
            const root2 = await sql.query`
                SELECT ID, ItemName, ParentID FROM EnquiryFor 
                WHERE RequestNo = ${requestNo}
            `;
            console.table(root2.recordset);
            return;
        }

        const rootItem = root.recordset[0];
        console.log(`Root Item: ${rootItem.ItemName} (ID: ${rootItem.ID})`);

        // 2. Set LeadJobCode = 'L1'
        await sql.query`
            UPDATE EnquiryFor 
            SET LeadJobCode = 'L1' 
            WHERE ID = ${rootItem.ID}
        `;
        console.log(`Set LeadJobCode 'L1' for ID ${rootItem.ID}`);

        // 3. Verify
        const verify = await sql.query`
            SELECT ID, ItemName, LeadJobCode 
            FROM EnquiryFor 
            WHERE ID = ${rootItem.ID}
        `;
        console.log('Verified:', verify.recordset[0]);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

fixEnquiry50LeadJobCode();
