const sql = require('mssql');
require('dotenv').config();

async function checkEnquiryCustomers() {
    try {
        await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: { encrypt: false, trustServerCertificate: true }
        });

        console.log('=== Enquiry 43 Customer Data ===\n');

        // Check EnquiryCustomer table
        const customers = await sql.query`
            SELECT CustomerName 
            FROM EnquiryCustomer 
            WHERE RequestNo = '43'
        `;
        console.log('EnquiryCustomer table:');
        customers.recordset.forEach(r => console.log('  -', r.CustomerName));

        // Check EnquiryMaster
        const master = await sql.query`
            SELECT CustomerName 
            FROM EnquiryMaster 
            WHERE RequestNo = '43'
        `;
        console.log('\nEnquiryMaster.CustomerName:', master.recordset[0]?.CustomerName);

        // Check EnquiryFor (divisions)
        const divisions = await sql.query`
            SELECT ID, ItemName, ParentID, CommonMailIds, CCMailIds
            FROM EnquiryFor 
            WHERE RequestNo = '43'
            ORDER BY ParentID, ID
        `;
        console.log('\nEnquiryFor (Divisions):');
        divisions.recordset.forEach(r => {
            console.log(`  ID: ${r.ID} | Name: ${r.ItemName} | ParentID: ${r.ParentID || 'NULL'}`);
            if (r.CommonMailIds) console.log(`    Common: ${r.CommonMailIds}`);
            if (r.CCMailIds) console.log(`    CC: ${r.CCMailIds}`);
        });

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        sql.close();
    }
}

checkEnquiryCustomers();
