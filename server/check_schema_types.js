const { connectDB, sql } = require('./dbConfig');
const fs = require('fs');

async function checkSchema() {
    try {
        await connectDB();
        const result = await sql.query`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryMaster'`;
        fs.writeFileSync('schema_types.txt', JSON.stringify(result.recordset, null, 2));
        console.log('Results written to schema_types.txt');
        process.exit(0);
    } catch (err) {
        fs.writeFileSync('schema_types.txt', 'Error: ' + err.message);
        process.exit(1);
    }
}

checkSchema();
