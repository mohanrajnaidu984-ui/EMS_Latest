const { sql, connectDB } = require('./dbConfig');

const createRelationshipTables = async () => {
    try {
        await connectDB();
        console.log('Connected to database...');

        const queries = [
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryCustomers' AND xtype='U')
            CREATE TABLE EnquiryCustomers (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                EnquiryID NVARCHAR(50),
                CustomerName NVARCHAR(255)
            )`,
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryContacts' AND xtype='U')
            CREATE TABLE EnquiryContacts (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                EnquiryID NVARCHAR(50),
                ContactName NVARCHAR(100),
                CompanyName NVARCHAR(255)
            )`,
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryTypes' AND xtype='U')
            CREATE TABLE EnquiryTypes (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                EnquiryID NVARCHAR(50),
                TypeName NVARCHAR(100)
            )`,
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquirySelectedItems' AND xtype='U')
            CREATE TABLE EnquirySelectedItems (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                EnquiryID NVARCHAR(50),
                ItemName NVARCHAR(100)
            )`,
            `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryConcernedSEs' AND xtype='U')
            CREATE TABLE EnquiryConcernedSEs (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                EnquiryID NVARCHAR(50),
                SEName NVARCHAR(100)
            )`
        ];

        for (const query of queries) {
            await sql.query(query);
            console.log('Table check/creation executed.');
        }

        console.log('All relationship tables initialized successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error initializing tables:', err);
        process.exit(1);
    }
};

createRelationshipTables();
