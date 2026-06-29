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
const storedCustomers = [
    { CompanyName: "Customer X Ltd", Category: "Contractor", Status: "Active", Address1: "123 Main St", Phone1: "222" },
    { CompanyName: "Customer Y Corp", Category: "Contractor", Status: "Active", Address1: "456 Oak Ave", Phone1: "555" },
    { CompanyName: "Client Z Inc", Category: "Client", Status: "Active", Address1: "789 Pine Rd", Phone1: "888" },
    { CompanyName: "Consultant A", Category: "Consultant", Status: "Active", Address1: "101 Elm Blvd", Phone1: "000" },
    { CompanyName: "Tata", Category: "Contractor", Status: "Active", Address1: "sfsfds", Phone1: "24214", Address2: "svsv", Rating: "4" }
];

async function seedCustomers() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(config);
        console.log('Connected!');

        for (const customer of storedCustomers) {
            const { CompanyName, Category, Status, Address1, Address2, Phone1, Rating, Type, FaxNo, Phone2, EmailId, Website } = customer;

            let tableName = 'Master_CustomerName';
            if (Category === 'Client') {
                tableName = 'Master_ClientName';
            } else if (Category === 'Consultant') {
                tableName = 'Master_ConsultantName';
            }

            // Check if customer already exists
            const checkQuery = `SELECT * FROM ${tableName} WHERE CompanyName = @CompanyName`;
            const existing = await pool.request()
                .input('CompanyName', sql.NVarChar, CompanyName)
                .query(checkQuery);

            if (existing.recordset.length === 0) {
                console.log(`Adding ${CompanyName} to ${tableName}...`);
                const insertQuery = `
                    INSERT INTO ${tableName} (Category, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status)
                    VALUES (@Category, @CompanyName, @Address1, @Address2, @Rating, @Type, @FaxNo, @Phone1, @Phone2, @EmailId, @Website, @Status)
                `;
                await pool.request()
                    .input('Category', sql.NVarChar, Category)
                    .input('CompanyName', sql.NVarChar, CompanyName)
                    .input('Address1', sql.NVarChar, Address1 || '')
                    .input('Address2', sql.NVarChar, Address2 || '')
                    .input('Rating', sql.NVarChar, Rating || '')
                    .input('Type', sql.NVarChar, Type || '')
                    .input('FaxNo', sql.NVarChar, FaxNo || '')
                    .input('Phone1', sql.NVarChar, Phone1 || '')
                    .input('Phone2', sql.NVarChar, Phone2 || '')
                    .input('EmailId', sql.NVarChar, EmailId || '')
                    .input('Website', sql.NVarChar, Website || '')
                    .input('Status', sql.NVarChar, Status || 'Active')
                    .query(insertQuery);
                console.log(`✅ Added ${CompanyName}`);
            } else {
                console.log(`⏭️  ${CompanyName} already exists, skipping`);
            }
        }

        console.log('\n✅ Customer seeding complete!');
        await pool.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

seedCustomers();
