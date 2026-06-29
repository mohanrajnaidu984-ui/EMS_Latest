const sql = require('mssql');
const fs = require('fs');
require('dotenv').config();

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

const checkAttachments = async () => {
    try {
        await sql.connect(config);
        console.log('Connected to database...');

        const result = await sql.query`SELECT AttachmentID, EnquiryID, FileName, DATALENGTH(FileData) as Size FROM EnquiryAttachments`;

        fs.writeFileSync('attachments.json', JSON.stringify(result.recordset, null, 2));
        console.log('Wrote to attachments.json');

        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
};

checkAttachments();
