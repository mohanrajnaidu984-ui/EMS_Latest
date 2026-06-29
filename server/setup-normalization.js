const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 30000,
        requestTimeout: 30000
    }
};

const createNormalizationTables = async () => {
    try {
        await sql.connect(config);
        console.log('Connected to database...');

        const queries = [
            // 1. Create New Tables
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryCustomers' AND xtype='U')
            CREATE TABLE EnquiryCustomers (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                EnquiryID NVARCHAR(50) NOT NULL,
                CustomerName NVARCHAR(255) NOT NULL,
                FOREIGN KEY (EnquiryID) REFERENCES Enquiries(RequestNo) ON DELETE CASCADE
            )`,
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryContacts' AND xtype='U')
            CREATE TABLE EnquiryContacts (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                EnquiryID NVARCHAR(50) NOT NULL,
                ContactName NVARCHAR(100) NOT NULL,
                CompanyName NVARCHAR(255),
                FOREIGN KEY (EnquiryID) REFERENCES Enquiries(RequestNo) ON DELETE CASCADE
            )`,
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryTypes' AND xtype='U')
            CREATE TABLE EnquiryTypes (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                EnquiryID NVARCHAR(50) NOT NULL,
                TypeName NVARCHAR(100) NOT NULL,
                FOREIGN KEY (EnquiryID) REFERENCES Enquiries(RequestNo) ON DELETE CASCADE
            )`,
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquirySelectedItems' AND xtype='U')
            CREATE TABLE EnquirySelectedItems ( -- For EnquiryFor
                ID INT IDENTITY(1,1) PRIMARY KEY,
                EnquiryID NVARCHAR(50) NOT NULL,
                ItemName NVARCHAR(100) NOT NULL,
                FOREIGN KEY (EnquiryID) REFERENCES Enquiries(RequestNo) ON DELETE CASCADE
            )`,
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryConcernedSEs' AND xtype='U')
            CREATE TABLE EnquiryConcernedSEs (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                EnquiryID NVARCHAR(50) NOT NULL,
                SEName NVARCHAR(100) NOT NULL,
                FOREIGN KEY (EnquiryID) REFERENCES Enquiries(RequestNo) ON DELETE CASCADE
            )`
        ];

        for (const query of queries) {
            await sql.query(query);
            console.log('Table created/verified.');
        }

        // 2. Drop Legacy Columns
        const dropColumnsQuery = `
            ALTER TABLE Enquiries DROP COLUMN 
            EnquiryType, 
            EnquiryFor, 
            CustomerName, 
            ReceivedFrom, 
            ConcernedSE
        `;

        try {
            await sql.query(dropColumnsQuery);
            console.log('Legacy columns dropped successfully.');
        } catch (err) {
            // Ignore error if columns are already dropped (Error 4924 or similar)
            console.log('Columns might have already been dropped or error occurred:', err.message);
        }

        console.log('Full normalization setup completed.');
        await sql.close();
    } catch (err) {
        console.error('Error initializing tables:', err);
    }
};

createNormalizationTables();
