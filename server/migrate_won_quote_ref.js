const { sql, connectDB } = require('./dbConfig');

async function migrate() {
    await connectDB();
    try {
        console.log('Adding WonQuoteRef column to EnquiryMaster...');
        await sql.query`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('EnquiryMaster') AND name = 'WonQuoteRef')
            BEGIN
                ALTER TABLE EnquiryMaster ADD WonQuoteRef NVARCHAR(100);
                PRINT 'Column WonQuoteRef added successfully.';
            END
            ELSE
            BEGIN
                PRINT 'Column WonQuoteRef already exists.';
            END
        `;
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit();
    }
}

migrate();
