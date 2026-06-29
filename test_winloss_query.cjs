const { sql, connectDB } = require('./server/dbConfig');

async function test() {
    try {
        await connectDB();

        // Test the exact query used in Sales Report
        const request = new sql.Request();
        request.input('year', sql.Int, 2026);
        request.input('division', sql.NVarChar, 'BMS');

        const filterClause = ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND mef.DepartmentName = @division) `;

        const winLossRes = await request.query(`
            SELECT 
                Status, 
                COUNT(*) as Count,
                SUM(CASE 
                    WHEN UPPER(Status) = 'WON' THEN ISNULL(TRY_CAST(REPLACE(REPLACE(WonOrderValue, 'BD', ''), ',', '') AS DECIMAL(18,2)), 0)
                    WHEN UPPER(Status) = 'LOST' THEN ISNULL(TRY_CAST(REPLACE(REPLACE(LostCompetitorPrice, 'BD', ''), ',', '') AS DECIMAL(18,2)), 0)
                    WHEN UPPER(Status) IN ('FOLLOWUP', 'FOLLOW-UP') THEN ISNULL(TRY_CAST(REPLACE(REPLACE(CustomerPreferredPrice, 'BD', ''), ',', '') AS DECIMAL(18,2)), 0)
                    ELSE 0 
                END) as TotalValue
            FROM EnquiryMaster E
            WHERE YEAR(EnquiryDate) = @year ${filterClause}
              AND Status IN ('Won', 'Lost', 'Follow-up', 'FollowUp')
            GROUP BY Status
        `);

        console.log("Win-Loss Query Results:");
        console.log(JSON.stringify(winLossRes.recordset, null, 2));

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

test();
