const { sql, connectDB } = require('./dbConfig');

async function debugPricing() {
    try {
        await connectDB();
        console.log("Connected DB");

        // Get 5 random WON enquiries
        const enquiries = await sql.query(`
            SELECT TOP 5 RequestNo, WonOrderValue
            FROM EnquiryMaster
            WHERE Status = 'Won'
            ORDER BY EnquiryDate DESC
        `);

        for (const enq of enquiries.recordset) {
            console.log(`\n=== Enquiry: ${enq.RequestNo} (WonValue: ${enq.WonOrderValue}) ===`);

            // Get Items
            const items = await sql.query(`
                SELECT ID, ParentID, ItemName
                FROM EnquiryFor
                WHERE RequestNo = '${enq.RequestNo}'
            `);

            console.log(`Total Items: ${items.recordset.length}`);

            // detailed check
            for (const item of items.recordset) {
                // Get Price
                const priceRes = await sql.query(`
                    SELECT TOP 1 Price
                    FROM EnquiryPricingValues
                    WHERE RequestNo = '${enq.RequestNo}'
                      AND (EnquiryForID = ${item.ID} OR EnquiryForItem = '${item.ItemName}')
                    ORDER BY OptionID DESC
                `);

                const price = priceRes.recordset.length > 0 ? priceRes.recordset[0].Price : 'N/A';

                // Check if it's a root (ParentID check)
                const isRootNull = item.ParentID === null;
                const isRootZero = item.ParentID === 0;

                console.log(`  Item [${item.ID}] "${item.ItemName}" | ParentID: ${item.ParentID} (Null? ${isRootNull}) | Price: ${price}`);
            }

            // Test query
            const sumNull = await sql.query(`
                SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                FROM EnquiryFor EF_Inner
                OUTER APPLY (
                     SELECT TOP 1 Price 
                     FROM EnquiryPricingValues 
                     WHERE RequestNo = EF_Inner.RequestNo 
                       AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                     ORDER BY OptionID DESC
                ) EPV
                WHERE EF_Inner.RequestNo = '${enq.RequestNo}'
                  AND EF_Inner.ParentID IS NULL
            `);
            console.log(`  > SUM (ParentID IS NULL): ${sumNull.recordset[0].Total}`);

            const sumZero = await sql.query(`
                SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                FROM EnquiryFor EF_Inner
                OUTER APPLY (
                     SELECT TOP 1 Price 
                     FROM EnquiryPricingValues 
                     WHERE RequestNo = EF_Inner.RequestNo 
                       AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                     ORDER BY OptionID DESC
                ) EPV
                WHERE EF_Inner.RequestNo = '${enq.RequestNo}'
                  AND (EF_Inner.ParentID IS NULL OR EF_Inner.ParentID = 0)
            `);
            console.log(`  > SUM (ParentID IS NULL OR 0): ${sumZero.recordset[0].Total}`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

debugPricing();
