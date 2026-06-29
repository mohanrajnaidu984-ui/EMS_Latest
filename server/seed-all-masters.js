const sql = require('mssql');
const path = require('path');
const bcrypt = require('bcryptjs');
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

async function seedAllMasterData() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(config);
        console.log('Connected!\n');

        // 1. Seed Source of Enquiry
        console.log('=== Seeding Master_SourceOfEnquiry ===');
        const sources = ["Email", "Phone", "Public Tender Board", "Private Tender", "Customer Visit", "Cold visit by us", "Website", "Fax", "Thru top management", "News Paper"];
        for (const source of sources) {
            const existing = await pool.request().query`SELECT * FROM Master_SourceOfEnquiry WHERE SourceName = ${source}`;
            if (existing.recordset.length === 0) {
                await pool.request().query`INSERT INTO Master_SourceOfEnquiry (SourceName) VALUES (${source})`;
                console.log(`✅ Added: ${source}`);
            }
        }

        // 2. Seed Enquiry Types
        console.log('\n=== Seeding Master_EnquiryType ===');
        const types = ["New Tender", "Re-Tender", "Budgetary", "Job in hand", "Variation / Change order", "Supply only", "Maintenance", "Retrofit", "Upgradation", "Refurbishment", "Service", "Hiring", "Renting", "Facility Management", "Demo"];
        for (const type of types) {
            const existing = await pool.request().query`SELECT * FROM Master_EnquiryType WHERE TypeName = ${type}`;
            if (existing.recordset.length === 0) {
                await pool.request().query`INSERT INTO Master_EnquiryType (TypeName) VALUES (${type})`;
                console.log(`✅ Added: ${type}`);
            }
        }

        console.log('\n✅ All master data seeded successfully!');
        await pool.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

seedAllMasterData();
