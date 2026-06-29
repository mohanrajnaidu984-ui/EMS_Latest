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

const createTables = async () => {
    try {
        await sql.connect(config);
        console.log('Connected to database...');

        const tableQueries = [
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Customers' AND xtype='U')
            CREATE TABLE Customers (
                CustomerID INT IDENTITY(1,1) PRIMARY KEY,
                Category NVARCHAR(50),
                CompanyName NVARCHAR(255) NOT NULL,
                Address1 NVARCHAR(MAX),
                Address2 NVARCHAR(MAX),
                Rating NVARCHAR(50),
                CustomerType NVARCHAR(50),
                FaxNo NVARCHAR(50),
                Phone1 NVARCHAR(50),
                Phone2 NVARCHAR(50),
                Email NVARCHAR(100),
                Website NVARCHAR(100),
                Status NVARCHAR(20) DEFAULT 'Active'
            )`,
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Contacts' AND xtype='U')
            CREATE TABLE Contacts (
                ContactID INT IDENTITY(1,1) PRIMARY KEY,
                Category NVARCHAR(50),
                CompanyName NVARCHAR(255),
                ContactName NVARCHAR(100) NOT NULL,
                Designation NVARCHAR(100),
                CategoryOfDesignation NVARCHAR(50),
                Address1 NVARCHAR(MAX),
                Address2 NVARCHAR(MAX),
                FaxNo NVARCHAR(50),
                Phone NVARCHAR(50),
                Mobile1 NVARCHAR(50),
                Mobile2 NVARCHAR(50),
                EmailId NVARCHAR(100)
            )`,
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
            CREATE TABLE Users (
                UserID INT IDENTITY(1,1) PRIMARY KEY,
                FullName NVARCHAR(100) NOT NULL,
                Designation NVARCHAR(100),
                Email NVARCHAR(100) NOT NULL, -- Changed from MailId to match code
                LoginPassword NVARCHAR(100) NOT NULL,
                Status NVARCHAR(20) DEFAULT 'Active',
                Department NVARCHAR(50),
                Roles NVARCHAR(MAX)
            )`,
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='MasterEnquiryItems' AND xtype='U')
            CREATE TABLE MasterEnquiryItems ( -- Renamed from EnquiryItems to match code
                ItemID INT IDENTITY(1,1) PRIMARY KEY,
                ItemName NVARCHAR(100) NOT NULL,
                CompanyName NVARCHAR(255),
                DepartmentName NVARCHAR(100),
                Status NVARCHAR(20) DEFAULT 'Active',
                CommonMailIds NVARCHAR(MAX),
                CCMailIds NVARCHAR(MAX)
            )`,
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Enquiries' AND xtype='U')
            CREATE TABLE Enquiries (
                RequestNo NVARCHAR(50) PRIMARY KEY,
                SourceOfInfo NVARCHAR(50),
                EnquiryDate DATETIME, -- Changed from DATE for compatibility
                DueOn DATETIME, -- Changed from DATE for compatibility
                SiteVisitDate DATETIME, -- Changed from DATE for compatibility
                EnquiryType NVARCHAR(MAX),
                EnquiryFor NVARCHAR(MAX),
                CustomerName NVARCHAR(MAX),
                ReceivedFrom NVARCHAR(MAX),
                ProjectName NVARCHAR(255),
                ClientName NVARCHAR(255),
                ConsultantName NVARCHAR(255),
                ConcernedSE NVARCHAR(MAX),
                DetailsOfEnquiry NVARCHAR(MAX),
                DocumentsReceived NVARCHAR(MAX),
                HardCopy BIT,
                Drawing BIT,
                DVD BIT,
                Spec BIT,
                EqpSchedule BIT,
                Remark NVARCHAR(MAX),
                AutoAck BIT,
                CeoSign BIT,
                Status NVARCHAR(50) DEFAULT 'Enquiry',
                CreatedAt DATETIME DEFAULT GETDATE()
            )`,
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryAttachments' AND xtype='U')
            CREATE TABLE EnquiryAttachments (
                AttachmentID INT IDENTITY(1,1) PRIMARY KEY,
                EnquiryID NVARCHAR(50),
                FileName NVARCHAR(255),
                FilePath NVARCHAR(MAX),
                UploadedAt DATETIME DEFAULT GETDATE()
            )`
        ];

        for (const query of tableQueries) {
            await sql.query(query);
            console.log('Table check/creation executed.');
        }

        console.log('All tables initialized successfully.');
        await sql.close();
    } catch (err) {
        console.error('Error initializing schema:', err);
    }
};

createTables();
