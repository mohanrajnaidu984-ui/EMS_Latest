const { sql, connectDB } = require('./dbConfig');

async function migrateData() {
    try {
        await connectDB();
        console.log('Connected to database for migration...');

        // 1. Migrate Customers
        console.log('Migrating Customers...');
        await sql.query(`
            INSERT INTO Master_CustomerName (CompanyName, Category)
            SELECT DISTINCT CustomerName, 'Contractor'
            FROM EnquiryCustomer
            WHERE CustomerName IS NOT NULL AND CustomerName NOT IN (SELECT CompanyName FROM Master_CustomerName)
        `);

        // 2. Migrate Contacts (Received From)
        console.log('Migrating Contacts...');
        await sql.query(`
            INSERT INTO Master_ReceivedFrom (ContactName)
            SELECT DISTINCT ContactName
            FROM ReceivedFrom
            WHERE ContactName IS NOT NULL AND ContactName NOT IN (SELECT ContactName FROM Master_ReceivedFrom)
        `);

        // 3. Migrate Users (Concerned SE)
        console.log('Migrating Users...');
        await sql.query(`
            INSERT INTO Master_ConcernedSE (FullName)
            SELECT DISTINCT SEName
            FROM ConcernedSE
            WHERE SEName IS NOT NULL AND SEName NOT IN (SELECT FullName FROM Master_ConcernedSE)
        `);

        // 4. Migrate Enquiry Types
        console.log('Migrating Enquiry Types...');
        await sql.query(`
            INSERT INTO Master_EnquiryType (TypeName)
            SELECT DISTINCT TypeName
            FROM EnquiryType
            WHERE TypeName IS NOT NULL AND TypeName NOT IN (SELECT TypeName FROM Master_EnquiryType)
        `);

        // 5. Migrate Enquiry For
        console.log('Migrating Enquiry For...');
        await sql.query(`
            INSERT INTO Master_EnquiryFor (ItemName)
            SELECT DISTINCT ItemName
            FROM EnquiryFor
            WHERE ItemName IS NOT NULL AND ItemName NOT IN (SELECT ItemName FROM Master_EnquiryFor)
        `);

        // 6. Migrate Clients from EnquiryMaster
        console.log('Migrating Clients...');
        await sql.query(`
            INSERT INTO Master_ClientName (CompanyName, Category)
            SELECT DISTINCT ClientName, 'Client'
            FROM EnquiryMaster
            WHERE ClientName IS NOT NULL AND ClientName NOT IN (SELECT CompanyName FROM Master_ClientName)
        `);

        // 7. Migrate Consultants from EnquiryMaster
        console.log('Migrating Consultants...');
        await sql.query(`
            INSERT INTO Master_ConsultantName (CompanyName, Category)
            SELECT DISTINCT ConsultantName, 'Consultant'
            FROM EnquiryMaster
            WHERE ConsultantName IS NOT NULL AND ConsultantName NOT IN (SELECT CompanyName FROM Master_ConsultantName)
        `);

        // 8. Migrate Source of Enquiry from EnquiryMaster
        console.log('Migrating Source of Enquiry...');
        await sql.query(`
            INSERT INTO Master_SourceOfEnquiry (SourceName)
            SELECT DISTINCT SourceOfEnquiry
            FROM EnquiryMaster
            WHERE SourceOfEnquiry IS NOT NULL AND SourceOfEnquiry NOT IN (SELECT SourceName FROM Master_SourceOfEnquiry)
        `);

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrateData();
