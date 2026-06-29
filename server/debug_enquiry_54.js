require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

async function debugEnquiry54() {
    try {
        await connectDB();
        console.log('--- Debugging Enquiry 54 ---');

        const itemsRes = await new sql.Request().query(`
            SELECT EF.ID, EF.ItemName 
            FROM EnquiryFor EF
            WHERE EF.RequestNo = '54'
        `);
        const itemMap = {};
        itemsRes.recordset.forEach(i => itemMap[i.ID] = i.ItemName);
        console.log('Item Map:', itemMap);

        const pricesRes = await new sql.Request().query(`SELECT EnquiryForID, EnquiryForItem, Price, UpdatedBy FROM EnquiryPricingValues WHERE RequestNo = '54'`);

        console.log('--- Pricing Entries ---');
        pricesRes.recordset.forEach(p => {
            const itemName = itemMap[p.EnquiryForID] || p.EnquiryForItem;
            console.log(`Item: ${itemName} (ID: ${p.EnquiryForID}) - Price: ${p.Price} - UpdatedBy: ${p.UpdatedBy}`);
        });

        process.exit(0);

    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

debugEnquiry54();
