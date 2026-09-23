'use strict';

const { connectDB, sql } = require('./dbConfig');

async function migrateQuoteAttachmentsVisibility() {
    try {
        await connectDB();
        console.log('Migrating QuoteAttachments visibility columns...');

        await sql.query`
            IF NOT EXISTS (
                SELECT * FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'QuoteAttachments' AND COLUMN_NAME = 'Visibility'
            )
            BEGIN
                ALTER TABLE QuoteAttachments ADD Visibility nvarchar(50) DEFAULT 'Public';
                PRINT 'Added QuoteAttachments.Visibility';
            END
        `;

        await sql.query`
            IF NOT EXISTS (
                SELECT * FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'QuoteAttachments' AND COLUMN_NAME = 'UploadedBy'
            )
            BEGIN
                ALTER TABLE QuoteAttachments ADD UploadedBy nvarchar(255) NULL;
                PRINT 'Added QuoteAttachments.UploadedBy';
            END
        `;

        await sql.query`
            IF NOT EXISTS (
                SELECT * FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'QuoteAttachments' AND COLUMN_NAME = 'Division'
            )
            BEGIN
                ALTER TABLE QuoteAttachments ADD Division nvarchar(255) NULL;
                PRINT 'Added QuoteAttachments.Division';
            END
        `;

        await sql.query`
            UPDATE QuoteAttachments SET Visibility = 'Public' WHERE Visibility IS NULL
        `;

        console.log('QuoteAttachments visibility migration completed.');
    } catch (err) {
        console.error('QuoteAttachments visibility migration failed:', err);
        process.exitCode = 1;
    } finally {
        process.exit();
    }
}

migrateQuoteAttachmentsVisibility();
