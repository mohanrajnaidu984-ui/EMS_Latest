const { sql, dbConfig } = require('./dbConfig');

async function runMigration() {
    try {
        console.log('Connecting to database...');
        await sql.connect(dbConfig);
        console.log('Connected.');

        const query = `
            IF NOT EXISTS (
              SELECT * FROM sys.columns 
              WHERE object_id = OBJECT_ID(N'[dbo].[EnquiryPricingValues]') 
              AND name = 'LeadJobName'
            )
            BEGIN
                ALTER TABLE [dbo].[EnquiryPricingValues] 
                ADD [LeadJobName] NVARCHAR(255) NULL;
                PRINT 'Added LeadJobName column to EnquiryPricingValues table';
            END
            ELSE
            BEGIN
                PRINT 'LeadJobName column already exists in EnquiryPricingValues';
            END
        `;

        await sql.query(query);
        console.log('Migration executed successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await sql.close();
    }
}

runMigration();
