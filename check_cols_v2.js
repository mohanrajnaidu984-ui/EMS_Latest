const sql = require('mssql');
const config = require('./server/dbConfig');

async function run() {
    try {
        await sql.connect(config);
        console.log('Connected.');
        const res = await sql.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryMaster' AND (COLUMN_NAME LIKE '%Client%' OR COLUMN_NAME LIKE '%Customer%' OR COLUMN_NAME LIKE '%Received%')");
        console.log("Columns:", res.recordset);
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}
run();
