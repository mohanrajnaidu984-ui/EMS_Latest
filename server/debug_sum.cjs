const { sql, connectDB } = require('./dbConfig');

async function runDebug() {
    try {
        await connectDB();
        console.log('Connected.');

        const year = 2026;
        const division = 'BMS';
        const departmentName = 'BMS';

        const request = new sql.Request();
        request.input('year', sql.Int, year);
        request.input('division', sql.NVarChar, division);

        // Debug Request 13
        const reqId = 13;
        console.log(`\n--- Testing Logic for Req ${reqId} ---`);

        // 1. Direct Sum Query (The one used in valueExpression)
        const itemSumQuery = `
            SELECT SUM(ISNULL(EPV.Price, 0)) as CalculatedSum
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
            AND NOT EXISTS (
                 SELECT 1 
                 FROM EnquiryFor EF_Parent
                 JOIN Master_EnquiryFor MEF_Parent ON (EF_Parent.ItemName = MEF_Parent.ItemName OR EF_Parent.ItemName LIKE '% - ' + MEF_Parent.ItemName)
                 WHERE EF_Parent.RequestNo = EF_Inner.RequestNo
                   AND EF_Parent.ID = EF_Inner.ParentID
                   AND MEF_Parent.DepartmentName = @division
            )
        `;

        const res = await request.query(itemSumQuery);
        console.log('Main Sum Result:');
        console.table(res.recordset);

        // 2. Debug Components
        console.log('\n--- Debugging Components ---');
        const debugCompQuery = `
            SELECT 
                EF_Inner.ID,
                EF_Inner.ItemName,
                MEF_Inner.DepartmentName,
                EPV.Price,
                EF_Inner.ParentID
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
        `;
        const resComp = await request.query(debugCompQuery);
        console.log('Components:');
        console.table(resComp.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

runDebug();
