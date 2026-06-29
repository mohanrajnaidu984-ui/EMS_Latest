const { connectDB, sql } = require('./dbConfig');

async function debugItemStats() {
    try {
        await connectDB();
        const request = new sql.Request();
        const year = 2026;
        request.input('year', sql.Int, year);

        console.log(`Running query for Year: ${year}`);

        // 1. Check EnquiryFor vs Master_EnquiryFor counts and content
        const countEF = await request.query('SELECT COUNT(*) as Count FROM EnquiryFor');
        console.log('EnquiryFor Total Rows:', countEF.recordset[0].Count);

        const countMEF = await request.query('SELECT COUNT(*) as Count FROM Master_EnquiryFor');
        console.log('Master_EnquiryFor Total Rows:', countMEF.recordset[0].Count);

        // 2. Run the main query
        const query = `
            SELECT 
                mef.DepartmentName as ItemName,
                SUM(CASE WHEN E.Status = 'Won' THEN ISNULL(TRY_CAST(REPLACE(REPLACE(E.WonOrderValue, 'BD', ''), ',', '') AS DECIMAL(18,2)), 0) ELSE 0 END) as WonValue,
                SUM(CASE WHEN E.Status = 'Lost' THEN ISNULL(TRY_CAST(REPLACE(REPLACE(E.LostCompetitorPrice, 'BD', ''), ',', '') AS DECIMAL(18,2)), 0) ELSE 0 END) as LostValue,
                SUM(CASE WHEN E.Status IN ('Follow-up', 'FollowUp') THEN ISNULL(TRY_CAST(REPLACE(REPLACE(E.CustomerPreferredPrice, 'BD', ''), ',', '') AS DECIMAL(18,2)), 0) ELSE 0 END) as FollowUpValue,
                COUNT(*) as Count
            FROM EnquiryMaster E
            JOIN EnquiryFor EF ON E.RequestNo = EF.RequestNo
            JOIN Master_EnquiryFor mef ON (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '% - ' + mef.ItemName)
            WHERE YEAR(E.EnquiryDate) = @year 
            GROUP BY mef.DepartmentName
        `;

        const result = await request.query(query);
        console.log('Query Result Rows:', result.recordset.length);
        console.log('Query Result:', JSON.stringify(result.recordset, null, 2));

        if (result.recordset.length === 0) {
            console.log('DEBUGGING JOINS...');
            // Check direct mapping
            const checkMap = await request.query(`
                SELECT TOP 10 EF.ItemName, mef.ItemName as MasterItem, mef.DepartmentName
                FROM EnquiryFor EF
                LEFT JOIN Master_EnquiryFor mef ON (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '% - ' + mef.ItemName)
                WHERE mef.DepartmentName IS NULL OR mef.DepartmentName = ''
            `);
            console.log('Unmapped Items (Sample):', checkMap.recordset);

            const checkMapped = await request.query(`
                SELECT TOP 10 EF.ItemName, mef.ItemName as MasterItem, mef.DepartmentName
                FROM EnquiryFor EF
                JOIN Master_EnquiryFor mef ON (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '% - ' + mef.ItemName)
            `);
            console.log('Mapped Items (Sample):', checkMapped.recordset);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        // sql.close(); // Keep connection open or process hangs sometimes if closed too early in async scripts, but good practice to close.
        process.exit();
    }
}

debugItemStats();
