const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database configuration
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 30000
    }
};

const downloadFromDB = async (attachmentId) => {
    if (!attachmentId) {
        console.log('❌ Please provide an Attachment ID.');
        console.log('Usage: node download-from-db.js <AttachmentID>');
        return;
    }

    try {
        console.log(`🔌 Connecting to database...`);
        await sql.connect(config);

        console.log(`🔍 Fetching Attachment ID: ${attachmentId}...`);
        const result = await sql.query`SELECT FileName, FileData FROM EnquiryAttachments WHERE AttachmentID = ${attachmentId}`;

        if (result.recordset.length === 0) {
            console.log('❌ Attachment not found.');
        } else {
            const file = result.recordset[0];
            if (!file.FileData) {
                console.log('❌ File data is empty (NULL) in the database.');
            } else {
                const outputPath = path.join(__dirname, file.FileName);
                fs.writeFileSync(outputPath, file.FileData);
                console.log(`✅ File saved successfully to: ${outputPath}`);
                console.log(`📄 Size: ${file.FileData.length} bytes`);
            }
        }

        await sql.close();
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
};

// Get the Attachment ID from the command line arguments
const id = process.argv[2];
downloadFromDB(id);
