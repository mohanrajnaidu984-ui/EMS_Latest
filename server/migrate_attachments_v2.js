const { connectDB, sql } = require('./dbConfig');

async function migrateAttachments() {
    try {
        await connectDB();

        console.log('Checking for Visibility column...');
        const checkVisibility = await sql.query`
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Attachments' AND COLUMN_NAME = 'Visibility')
            BEGIN
                ALTER TABLE Attachments ADD Visibility nvarchar(50) DEFAULT 'Public';
                PRINT 'Added Visibility column';
            END
        `;

        console.log('Checking for AttachmentType column...');
        const checkType = await sql.query`
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Attachments' AND COLUMN_NAME = 'AttachmentType')
            BEGIN
                ALTER TABLE Attachments ADD AttachmentType nvarchar(50) DEFAULT 'File';
                PRINT 'Added AttachmentType column';
            END
        `;

        console.log('Checking for LinkURL column...');
        const checkLink = await sql.query`
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Attachments' AND COLUMN_NAME = 'LinkURL')
            BEGIN
                ALTER TABLE Attachments ADD LinkURL nvarchar(max);
                PRINT 'Added LinkURL column';
            END
        `;

        console.log('Checking for UploadedBy column...');
        const checkUser = await sql.query`
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Attachments' AND COLUMN_NAME = 'UploadedBy')
            BEGIN
                ALTER TABLE Attachments ADD UploadedBy nvarchar(255);
                PRINT 'Added UploadedBy column';
            END
        `;

        console.log('Checking for Division column...');
        const checkDiv = await sql.query`
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Attachments' AND COLUMN_NAME = 'Division')
            BEGIN
                ALTER TABLE Attachments ADD Division nvarchar(255);
                PRINT 'Added Division column';
            END
        `;

        // Update existing records to have 'Public' and 'File'
        await sql.query`UPDATE Attachments SET Visibility = 'Public' WHERE Visibility IS NULL`;
        await sql.query`UPDATE Attachments SET AttachmentType = 'File' WHERE AttachmentType IS NULL`;

        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit();
    }
}

migrateAttachments();
