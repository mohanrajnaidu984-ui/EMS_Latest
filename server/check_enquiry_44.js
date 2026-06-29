const sql = require('mssql');
require('dotenv').config();

async function checkEnquiry44() {
    try {
        await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: { encrypt: false, trustServerCertificate: true }
        });

        console.log('=== Enquiry 44 Data ===\n');

        // Check EnquiryMaster
        const master = await sql.query`
            SELECT RequestNo, CustomerName, ReceivedFrom 
            FROM EnquiryMaster 
            WHERE RequestNo = '44'
        `;
        console.log('EnquiryMaster:');
        console.log('  CustomerName:', master.recordset[0]?.CustomerName);
        console.log('  ReceivedFrom:', master.recordset[0]?.ReceivedFrom);

        // Check EnquiryCustomer
        console.log('\nEnquiryCustomer:');
        const customers = await sql.query`
            SELECT CustomerName, ReceivedFrom 
            FROM EnquiryCustomer 
            WHERE RequestNo = '44'
        `;
        customers.recordset.forEach(c => {
            console.log(`\n  Customer: ${c.CustomerName}`);
            console.log(`  ReceivedFrom: ${c.ReceivedFrom || 'NULL'}`);
        });

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        sql.close();
    }
}

checkEnquiry44();
