const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const requestNos = "'20','21'";
        const res = await new sql.Request().query(`
            SELECT 
                EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName,
                ISNULL(EPV.Price, 0) as NetPrice
            FROM EnquiryFor EF
            OUTER APPLY (
                SELECT TOP 1 Price 
                FROM EnquiryPricingValues 
                WHERE RequestNo = EF.RequestNo 
                  AND (EnquiryForID = EF.ID OR EnquiryForItem = EF.ItemName)
                ORDER BY OptionID DESC
            ) EPV
            WHERE EF.RequestNo IN (${requestNos})
        `);
        res.recordset.forEach(r => {
            console.log(`REQ: ${r.RequestNo} | ITEM: ${r.ItemName} | PRICE: ${r.NetPrice}`);
        });
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
