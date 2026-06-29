const { sql, connectDB } = require('./server/dbConfig');

async function check() {
    try {
        await connectDB();

        // Check won enquiries for BMS
        const request = new sql.Request();
        request.input('year', sql.Int, 2026);
        request.input('division', sql.NVarChar, 'BMS');

        const filterClause = ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND mef.DepartmentName = @division) `;

        const wonRes = await request.query(`
            SELECT RequestNo, ProjectName, WonCustomerName, WonOrderValue, ExpectedOrderDate
            FROM EnquiryMaster E
            WHERE Status = 'Won' AND YEAR(ExpectedOrderDate) = @year ${filterClause}
        `);

        console.log("Won Enquiries for BMS in 2026:");
        console.log(JSON.stringify(wonRes.recordset, null, 2));

        // Check ReceivedFrom data
        const rfRes = await sql.query("SELECT * FROM ReceivedFrom WHERE RequestNo IN (SELECT RequestNo FROM EnquiryMaster WHERE Status = 'Won')");
        console.log("\nReceivedFrom for Won Enquiries:");
        console.log(JSON.stringify(rfRes.recordset, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
