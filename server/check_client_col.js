const sql = require('mssql');
const config = require('./dbConfig');

async function run() {
    try {
        await sql.connect(config);
        console.log('Connected to DB...');

        // Check for columns with 'Client' in name
        const result = await sql.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryMaster' AND COLUMN_NAME LIKE '%Client%'");
        console.log("Columns matching 'Client':", result.recordset);

        // Also check columns with 'Name' to see if there's an alias
        const nameCols = await sql.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryMaster' AND COLUMN_NAME LIKE '%Name%'");
        console.log("Columns matching 'Name':", nameCols.recordset);

        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}
run();
