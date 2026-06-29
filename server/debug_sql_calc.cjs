const { sql, connectDB } = require('./dbConfig');

async function runDebug() {
    try {
        await connectDB();
        console.log('Connected.');

        const year = 2026;
        const division = 'BMS';
        const departmentName = 'BMS'; // Assumption based on filter

        const request = new sql.Request();
        request.input('year', sql.Int, year);
        request.input('division', sql.NVarChar, division);

        // Test Request 13 and 18 specifically
        const testIds = [13, 18];

        for (const id of testIds) {
            console.log(`\n--- Inspecting RequestNo: ${id} ---`);

            // 1. Check EnquiryFor items
            const efQuery = `
                SELECT ID, ItemName, ParentID
                FROM EnquiryFor 
                WHERE RequestNo = ${id}
            `;
            const efRes = await request.query(efQuery);
            console.log('EnquiryFor Items:', efRes.recordset);

            // 2. Check Master_EnquiryFor mapping
            const mefQuery = `
                SELECT ef.ID as EF_ID, ef.ItemName, mef.DepartmentName
                FROM EnquiryFor ef
                LEFT JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
                WHERE ef.RequestNo = ${id}
            `;
            const mefRes = await request.query(mefQuery);
            console.log('Master_EnquiryFor Mapping:', mefRes.recordset);

            // 3. Check Pricing Values
            const priceQuery = `
                 SELECT EnquiryForID, EnquiryForItem, Price 
                 FROM EnquiryPricingValues 
                 WHERE RequestNo = ${id}
            `;
            const priceRes = await request.query(priceQuery);
            console.log('Pricing Values:', priceRes.recordset);

            // 4. Test the SUM Query Logic
            const itemSumQuery = `
                SELECT 
                    SUM(ISNULL(EPV.Price, 0)) as CalculatedSum
                FROM EnquiryFor EF_Inner
                JOIN Master_EnquiryFor MEF_Inner ON (EF_Inner.ItemName = MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '% - ' + MEF_Inner.ItemName)
                OUTER APPLY (
                     SELECT TOP 1 Price 
                     FROM EnquiryPricingValues 
                     WHERE RequestNo = EF_Inner.RequestNo 
                       AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                     ORDER BY OptionID DESC
                ) EPV
                WHERE EF_Inner.RequestNo = ${id}
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
            const sumRes = await request.query(itemSumQuery);
            console.log('Calculated Sum (Query Result):', sumRes.recordset[0]);
            if (sumRes.recordset[0].CalculatedSum === null) {
                console.log('SUM IS NULL!');
            }
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

runDebug();
