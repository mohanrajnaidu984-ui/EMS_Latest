
const { connectDB, sql } = require('./dbConfig');
require('dotenv').config();

async function run() {
    try {
        await connectDB();

        console.log('--- Fetching Column Info ---');
        const res = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryFor'
        `;
        console.log(res.recordset.map(r => r.COLUMN_NAME));

        console.log('--- Fetching Data Sample ---');
        const sample = await sql.query`SELECT TOP 1 * FROM EnquiryFor`;
        console.log(sample.recordset[0]);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}
run();
