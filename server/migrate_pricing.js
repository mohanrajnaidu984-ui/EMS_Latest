// Pricing Module Migration Script
// Run this to create the EnquiryPricing tables

const sql = require('mssql');
require('dotenv').config();

const config = {
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function runMigration() {
    try {
        console.log('Connecting to database...');
        await sql.connect(config);

        // Create EnquiryPricingOptions table
        console.log('Creating EnquiryPricingOptions table...');
        await sql.query`
            IF OBJECT_ID('[dbo].[EnquiryPricingOptions]', 'U') IS NULL
            BEGIN
                CREATE TABLE [dbo].[EnquiryPricingOptions] (
                    [ID] INT NOT NULL IDENTITY(1,1),
                    [RequestNo] NVARCHAR(50) NOT NULL,
                    [OptionName] NVARCHAR(255) NOT NULL,
                    [SortOrder] INT DEFAULT 0,
                    [CreatedAt] DATETIME DEFAULT GETDATE(),
                    PRIMARY KEY ([ID])
                );
            END
        `;

        // Create EnquiryPricingValues table
        console.log('Creating EnquiryPricingValues table...');
        await sql.query`
            IF OBJECT_ID('[dbo].[EnquiryPricingValues]', 'U') IS NULL
            BEGIN
                CREATE TABLE [dbo].[EnquiryPricingValues] (
                    [ID] INT NOT NULL IDENTITY(1,1),
                    [RequestNo] NVARCHAR(50) NOT NULL,
                    [OptionID] INT NOT NULL,
                    [EnquiryForItem] NVARCHAR(255) NOT NULL,
                    [Price] DECIMAL(18,2) DEFAULT 0,
                    [UpdatedBy] NVARCHAR(100),
                    [UpdatedAt] DATETIME DEFAULT GETDATE(),
                    PRIMARY KEY ([ID])
                );
            END
        `;

        // Create indexes
        console.log('Creating indexes...');
        await sql.query`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PricingValues_RequestNo')
                CREATE INDEX IX_PricingValues_RequestNo ON EnquiryPricingValues(RequestNo);
        `;
        await sql.query`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PricingOptions_RequestNo')
                CREATE INDEX IX_PricingOptions_RequestNo ON EnquiryPricingOptions(RequestNo);
        `;

        console.log('Migration complete!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

runMigration();
