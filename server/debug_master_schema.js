
const { connectDB, sql } = require('./dbConfig');
require('dotenv').config();

async function run() {
    try {
        await connectDB();

        console.log('--- Fetching Master_EnquiryFor Columns ---');
        const res = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Master_EnquiryFor'
        `;
        console.log(res.recordset.map(r => r.COLUMN_NAME));

        console.log('--- Fetching Master_EnquiryFor Sample ---');
        const sample = await sql.query`SELECT TOP 1 * FROM Master_EnquiryFor`;
        console.log(sample.recordset[0]);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}
run();
