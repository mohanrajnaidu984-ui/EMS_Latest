const { connectDB, sql } = require('./dbConfig');

async function addRequestNoColumn() {
    try {
        await connectDB();
        console.log('Connected to DB');

        const tables = [
            'Master_SourceOfEnquiry',
            'Master_EnquiryType',
            'Master_EnquiryFor',
            'Master_ReceivedFrom',
            'Master_ConcernedSE',
            'Master_CustomerName',
            'Master_ClientName',
            'Master_ConsultantName'
        ];

        for (const table of tables) {
            try {
                await sql.query(`ALTER TABLE ${table} ADD RequestNo NVARCHAR(50)`);
                console.log(`Added RequestNo to ${table}`);
            } catch (err) {
                // Ignore if column already exists
                if (err.message.includes('Column names in each table must be unique')) {
                    console.log(`RequestNo already exists in ${table}`);
                } else {
                    console.error(`Error altering ${table}:`, err.message);
                }
            }
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

addRequestNoColumn();
