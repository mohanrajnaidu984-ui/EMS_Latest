
const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

async function checkSchema() {
    try {
        await connectDB();
        const result = await new sql.Request().query("SELECT TOP 0 * FROM Master_ConcernedSE");
        let output = 'Master_ConcernedSE Columns: ' + Object.keys(result.recordset.columns).join(', ') + '\n';

        const result2 = await new sql.Request().query("SELECT TOP 0 * FROM Master_EnquiryFor");
        output += 'Master_EnquiryFor Columns: ' + Object.keys(result2.recordset.columns).join(', ') + '\n';

        fs.writeFileSync('columns_info_v3.txt', output);
        console.log("Schema check done");
    } catch (err) {
        console.error(err);
        fs.writeFileSync('columns_info_v3.txt', 'Error: ' + err.message);
    }
    process.exit();
}

checkSchema();
