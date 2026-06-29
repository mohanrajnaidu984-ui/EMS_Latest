const { connectDB, sql } = require('./dbConfig');

async function checkMasterEnquiryFor() {
    try {
        await connectDB();

        console.log(`\n--- Master_EnquiryFor Values ---`);
        const result = await sql.query`
            SELECT ItemName, DivisionCode, DepartmentCode
            FROM Master_EnquiryFor 
            WHERE ItemName IN ('Civil Project', 'Electrical', 'BMS')
        `;

        for (const row of result.recordset) {
            console.log(`Item: "${row.ItemName}", DivCode: "${row.DivisionCode}", DeptCode: "${row.DepartmentCode}"`);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkMasterEnquiryFor();
