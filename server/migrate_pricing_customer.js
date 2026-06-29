const sql = require('mssql');
require('dotenv').config();

async function runMigration() {
    try {
        console.log('Connecting to database...');
        await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: {
                encrypt: true,
                trustServerCertificate: true
            }
        });

        console.log('Connected. Starting migration...');

        // Step 1: Add Column to Options
        try {
            await sql.query`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[EnquiryPricingOptions]') AND name = 'CustomerName')
                BEGIN
                    ALTER TABLE [dbo].[EnquiryPricingOptions] ADD [CustomerName] NVARCHAR(255) NULL;
                END
            `;
            console.log('Step 1: Added CustomerName to EnquiryPricingOptions');
        } catch (e) {
            console.error('Step 1 Failed:', e.message);
        }

        // Step 2: Add Column to Values
        try {
            await sql.query`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[EnquiryPricingValues]') AND name = 'CustomerName')
                BEGIN
                    ALTER TABLE [dbo].[EnquiryPricingValues] ADD [CustomerName] NVARCHAR(255) NULL;
                END
            `;
            console.log('Step 2: Added CustomerName to EnquiryPricingValues');
        } catch (e) {
            console.error('Step 2 Failed:', e.message);
        }

        // Step 3: Add Index (Safe to do anytime)
        try {
            await sql.query`
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PricingOptions_CustomerName')
                BEGIN
                    CREATE INDEX IX_PricingOptions_CustomerName ON EnquiryPricingOptions(CustomerName);
                END
            `;
            console.log('Step 3: Created Index');
        } catch (e) {
            console.error('Step 3 Failed:', e.message);
        }

        // Step 4: Backfill Data (Now safe because columns exist)
        console.log('Step 4: Backfilling data...');

        // Options Backfill
        const resultOptions = await sql.query`
            UPDATE opt
            SET opt.CustomerName = em.CustomerName
            FROM [dbo].[EnquiryPricingOptions] opt
            INNER JOIN [dbo].[EnquiryMaster] em ON opt.RequestNo = em.RequestNo
            WHERE opt.CustomerName IS NULL;
        `;
        console.log(`Backfilled Options: ${resultOptions.rowsAffected} rows`);

        // Values Backfill
        const resultValues = await sql.query`
            UPDATE val
            SET val.CustomerName = em.CustomerName
            FROM [dbo].[EnquiryPricingValues] val
            INNER JOIN [dbo].[EnquiryMaster] em ON val.RequestNo = em.RequestNo
            WHERE val.CustomerName IS NULL;
        `;
        console.log(`Backfilled Values: ${resultValues.rowsAffected} rows`);

        console.log('Migration completed successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await sql.close();
    }
}

runMigration();
