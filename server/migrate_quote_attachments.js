const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ? process.env.DB_PASSWORD.replace(/^"|"$/g, '') : '',
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function migrate() {
    try {
        await sql.connect(config);
        console.log('Connected to DB');

        const createTableQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='QuoteAttachments' AND xtype='U')
            CREATE TABLE QuoteAttachments (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                QuoteID INT,
                FileName NVARCHAR(500),
                FilePath NVARCHAR(MAX),
                FileData VARBINARY(MAX),
                UploadedAt DATETIME DEFAULT GETDATE()
            )
        `;
        await sql.query(createTableQuery);
        console.log('QuoteAttachments table created or already exists');

        await sql.close();
    } catch (err) {
        console.error('Migration failed:', err);
    }
}

migrate();
