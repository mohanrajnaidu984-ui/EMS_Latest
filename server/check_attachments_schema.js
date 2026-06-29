const { connectDB, sql } = require('./dbConfig');

async function checkAttachmentsSchema() {
    try {
        await connectDB();
        const res = await sql.query`
            SELECT COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'Attachments'
        `;
        console.log('--- Attachments Table Columns ---');
        res.recordset.forEach(row => {
            console.log(`${row.COLUMN_NAME}: ${row.DATA_TYPE}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkAttachmentsSchema();
