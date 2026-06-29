const { sql, connectDB } = require('./dbConfig');

async function runDebug() {
    try {
        await connectDB();
        console.log('Connected.');

        const year = 2026;
        // const division = 'BMS';
        // const departmentName = 'BMS';

        const request = new sql.Request();
        request.input('year', sql.Int, year);
        // request.input('division', sql.NVarChar, division);

        // Debug: Check ID 13 specifically logic
        // It failed in real app (Total=0). 
        // Let's mimic EXACTLY what the app does in salesReportRoutes (summary logic) 

        // Logic from salesReportRoutes:
        // if (safeDivision && safeDivision !== 'All') { ... }
        // BUT I removed the check and applied itemSumQuery GLOBALLY.
        // Wait, did I? 
        // Let's re-read step 265 code.
        // I put `const itemSumQuery = ...`
        // THEN `const valueExpression = ISNULL(${itemSumQuery}, 0)`
        // AND `itemSumQuery` uses `${subQueryWhere}`
        // AND `subQueryWhere` is EMPTY if no division filter.
        // BUT if division filter is 'BMS', `subQueryWhere` is `AND MEF_Inner.DepartmentName = @division`.

        // PROBLEM:
        // If I am view as 'BMS' user (or filter=BMS), `itemSumQuery` ONLY sums items with DepartmentName='BMS'.
        // Request 13 has item "BMS".
        // Does "BMS" item map to "BMS" Department?

        console.log('Checking Request 13 Item Mapping...');
        const q13 = `
            SELECT EF.ItemName, MEF.DepartmentName
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo = 13
        `;
        const r13 = await request.query(q13);
        console.log('Req 13 Items:', r13.recordset);

        // If query returns DepartmentName='BMS', then sum should work.
        // If it returns NULL, sum is 0.

        console.log('Checking Request 18 Item Mapping...');
        const q18 = `
            SELECT EF.ItemName, MEF.DepartmentName
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo = 18
        `;
        const r18 = await request.query(q18);
        console.log('Req 18 Items:', r18.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

runDebug();
