const { connectDB, sql } = require('./dbConfig');

async function clearDatabase() {
    try {
        await connectDB();
        console.log('Connected to DB');

        // 1. Clear EnquiryMaster (Cascades to transaction tables)
        console.log('Clearing EnquiryMaster and related transaction tables...');
        await sql.query`DELETE FROM EnquiryMaster`;
        console.log('EnquiryMaster cleared.');

        // 2. Clear Master Tables
        const masterTables = [
            'Master_SourceOfEnquiry',
            'Master_EnquiryType',
            'Master_EnquiryFor',
            'Master_ReceivedFrom',
            'Master_ConcernedSE',
            'Master_CustomerName',
            'Master_ClientName',
            'Master_ConsultantName'
        ];

        console.log('Clearing Master tables...');
        for (const table of masterTables) {
            try {
                await sql.query(`DELETE FROM ${table}`);
                console.log(`Cleared ${table}`);
            } catch (err) {
                console.error(`Error clearing ${table}:`, err.message);
            }
        }

        console.log('Database cleanup complete.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

clearDatabase();
