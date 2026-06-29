const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected to DB');

        const createTableQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='MasterEnquiryItems' AND xtype='U')
            CREATE TABLE MasterEnquiryItems (
                ItemID INT IDENTITY(1,1) PRIMARY KEY,
                ItemName NVARCHAR(100) NOT NULL,
                CompanyName NVARCHAR(255),
                DepartmentName NVARCHAR(100),
                Status NVARCHAR(20) DEFAULT 'Active',
                CommonMailIds NVARCHAR(MAX),
                CCMailIds NVARCHAR(MAX),
                CreatedAt DATETIME DEFAULT GETDATE(),
                UpdatedAt DATETIME DEFAULT GETDATE()
            );
        `;

        await sql.query(createTableQuery);
        console.log('MasterEnquiryItems table created (if not exists).');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

run();
