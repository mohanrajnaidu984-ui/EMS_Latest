const sql = require('mssql');
const { dbConfig } = require('./dbConfig');
const fs = require('fs');

async function dumpOptions() {
    try {
        await sql.connect(dbConfig);
        const res = await sql.query`SELECT CustomerName FROM EnquiryPricingOptions WHERE RequestNo = 14`;
        fs.writeFileSync('debug_enq14_options.json', JSON.stringify(res.recordset, null, 2));
        process.exit();
    } catch (err) {
        process.exit(1);
    }
}
dumpOptions();
