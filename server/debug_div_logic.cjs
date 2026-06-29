const { sql, connectDB } = require('./dbConfig');

async function run() {
    try {
        await connectDB();
        console.log("Connected.");
        const reqId = 13;
        const division = 'BMS';

        const request = new sql.Request();
        request.input('division', sql.NVarChar, division);

        console.log("Testing Query with LTRIM...");
        const query = `
                    SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                     FROM EnquiryFor EF_Inner
                     JOIN Master_EnquiryFor MEF_Inner ON (EF_Inner.ItemName = MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '% - ' + MEF_Inner.ItemName)
                     OUTER APPLY (
                         SELECT TOP 1 Price 
                         FROM EnquiryPricingValues 
                         WHERE RequestNo = EF_Inner.RequestNo 
                           AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                         ORDER BY OptionID DESC
                     ) EPV
                     WHERE EF_Inner.RequestNo = ${reqId}
                     AND LTRIM(RTRIM(MEF_Inner.DepartmentName)) = @division
        `;

        const res = await request.query(query);
        console.log('Total (LTRIM):', res.recordset[0]);

        console.log("Testing Query WITHOUT LTRIM...");
        const query2 = `
                    SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                     FROM EnquiryFor EF_Inner
                     JOIN Master_EnquiryFor MEF_Inner ON (EF_Inner.ItemName = MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '% - ' + MEF_Inner.ItemName)
                     OUTER APPLY (
                         SELECT TOP 1 Price 
                         FROM EnquiryPricingValues 
                         WHERE RequestNo = EF_Inner.RequestNo 
                           AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                         ORDER BY OptionID DESC
                     ) EPV
                     WHERE EF_Inner.RequestNo = ${reqId}
                     AND MEF_Inner.DepartmentName = @division
        `;
        const res2 = await request.query(query2);
        console.log('Total (Simple):', res2.recordset[0]);

        // Debug Req 18
        const reqId18 = 18;
        console.log("Testing Req 18 Query WITHOUT LTRIM...");
        const query3 = `
                    SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                     FROM EnquiryFor EF_Inner
                     JOIN Master_EnquiryFor MEF_Inner ON (EF_Inner.ItemName = MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '% - ' + MEF_Inner.ItemName)
                     OUTER APPLY (
                         SELECT TOP 1 Price 
                         FROM EnquiryPricingValues 
                         WHERE RequestNo = EF_Inner.RequestNo 
                           AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                         ORDER BY OptionID DESC
                     ) EPV
                     WHERE EF_Inner.RequestNo = ${reqId18}
                     AND MEF_Inner.DepartmentName = @division
        `;
        const res3 = await request.query(query3);
        console.log('Total Req 18 (Simple):', res3.recordset[0]);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
