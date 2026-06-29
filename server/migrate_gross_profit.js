const { sql, connectDB } = require('./dbConfig');

async function run() {
    try {
        await connectDB();
        const request = new sql.Request();
        await request.query(`
            IF NOT EXISTS (
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'EnquiryMaster' AND COLUMN_NAME = 'WonGrossProfit'
            )
            ALTER TABLE EnquiryMaster ADD WonGrossProfit DECIMAL(5,2) NULL
        `);
        console.log('SUCCESS: WonGrossProfit column added (or already existed).');
    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        process.exit(0);
    }
}

run();
