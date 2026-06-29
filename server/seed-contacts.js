const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 30000,
        requestTimeout: 30000,
        enableArithAbort: true
    }
};

// Mock data from frontend
const storedContacts = [
    { ContactName: "Velu", CompanyName: "Customer X Ltd", EmailId: "pa@custx.com", Category: "Contractor", Designation: "Manager", Address1: "123 Main St", Mobile1: "333" },
    { ContactName: "Vijay", CompanyName: "Customer Y Corp", EmailId: "pb@custy.com", Category: "Contractor", Designation: "Director", Address1: "456 Oak Ave", Mobile1: "666" },
    { ContactName: "Seema", CompanyName: "Customer X Ltd", EmailId: "sc@custx.com", Category: "Contractor", Designation: "Engineer", Address1: "123 Main St", Mobile1: "333" },
    { ContactName: "Person C - Engineer", CompanyName: "Client Z Inc", EmailId: "pc@clientz.com", Category: "Client", Designation: "Engineer", Address1: "789 Pine Rd", Mobile1: "999" },
    { ContactName: "MOhan", CompanyName: "Tata", EmailId: "mohaniraj.naidu984@gmail.com", Category: "Contractor", Designation: "AGM", CategoryOfDesignation: "Technical", Address1: "adafa", Address2: "afafa", FaxNo: "123143", Phone: "131414", Mobile1: "14124", Mobile2: "13142" }
];

async function seedContacts() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(config);
        console.log('Connected!');

        // First check what exists
        console.log('\n=== Current Contacts ===');
        const existing = await pool.request().query(`SELECT * FROM Master_ReceivedFrom`);
        console.log(`Count: ${existing.recordset.length}`);
        if (existing.recordset.length > 0) {
            console.table(existing.recordset);
        }

        // Seed contacts
        for (const contact of storedContacts) {
            const { ContactName, CompanyName, EmailId, Category, Designation, CategoryOfDesignation, Address1, Address2, FaxNo, Phone, Mobile1, Mobile2 } = contact;

            // Check if contact already exists
            const checkQuery = `SELECT * FROM Master_ReceivedFrom WHERE ContactName = @ContactName AND CompanyName = @CompanyName`;
            const existingContact = await pool.request()
                .input('ContactName', sql.NVarChar, ContactName)
                .input('CompanyName', sql.NVarChar, CompanyName)
                .query(checkQuery);

            if (existingContact.recordset.length === 0) {
                console.log(`Adding ${ContactName} (${CompanyName})...`);
                const insertQuery = `
                    INSERT INTO Master_ReceivedFrom (Category, CompanyName, ContactName, Designation, CategoryOfDesignation, Address1, Address2, FaxNo, Phone, Mobile1, Mobile2, EmailId)
                    VALUES (@Category, @CompanyName, @ContactName, @Designation, @CategoryOfDesignation, @Address1, @Address2, @FaxNo, @Phone, @Mobile1, @Mobile2, @EmailId)
                `;
                await pool.request()
                    .input('Category', sql.NVarChar, Category || '')
                    .input('CompanyName', sql.NVarChar, CompanyName || '')
                    .input('ContactName', sql.NVarChar, ContactName || '')
                    .input('Designation', sql.NVarChar, Designation || '')
                    .input('CategoryOfDesignation', sql.NVarChar, CategoryOfDesignation || '')
                    .input('Address1', sql.NVarChar, Address1 || '')
                    .input('Address2', sql.NVarChar, Address2 || '')
                    .input('FaxNo', sql.NVarChar, FaxNo || '')
                    .input('Phone', sql.NVarChar, Phone || '')
                    .input('Mobile1', sql.NVarChar, Mobile1 || '')
                    .input('Mobile2', sql.NVarChar, Mobile2 || '')
                    .input('EmailId', sql.NVarChar, EmailId || '')
                    .query(insertQuery);
                console.log(`✅ Added ${ContactName}`);
            } else {
                console.log(`⏭️  ${ContactName} (${CompanyName}) already exists, skipping`);
            }
        }

        console.log('\n✅ Contact seeding complete!');

        // Show final state
        console.log('\n=== Final Contacts ===');
        const final = await pool.request().query(`SELECT * FROM Master_ReceivedFrom`);
        console.log(`Count: ${final.recordset.length}`);
        console.table(final.recordset);

        await pool.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

seedContacts();
