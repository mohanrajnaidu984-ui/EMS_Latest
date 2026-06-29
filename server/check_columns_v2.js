
const { sql, poolPromise } = require('./dbConfig');
const fs = require('fs');

async function checkSchema() {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT TOP 0 * FROM Master_ConcernedSE");
        let output = 'Master_ConcernedSE Columns: ' + Object.keys(result.recordset.columns).join(', ') + '\n';

        const result2 = await pool.request().query("SELECT TOP 0 * FROM Master_EnquiryFor");
        output += 'Master_EnquiryFor Columns: ' + Object.keys(result2.recordset.columns).join(', ') + '\n';

        fs.writeFileSync('columns_info.txt', output);
    } catch (err) {
        fs.writeFileSync('columns_info.txt', 'Error: ' + err.message);
    }
    process.exit();
}

checkSchema();
