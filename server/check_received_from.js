const sql = require('mssql');
require('dotenv').config();

async function checkReceivedFromStructure() {
    try {
        await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: { encrypt: false, trustServerCertificate: true }
        });

        console.log('=== Checking ReceivedFrom Data Structure ===\n');

        // Check EnquiryMaster
        const master = await sql.query`
            SELECT RequestNo, CustomerName, ReceivedFrom 
            FROM EnquiryMaster 
            WHERE RequestNo = '43'
        `;
        console.log('EnquiryMaster:');
        console.log('  CustomerName:', master.recordset[0]?.CustomerName);
        console.log('  ReceivedFrom:', master.recordset[0]?.ReceivedFrom);

        // Check EnquiryCustomer table structure
        console.log('\nEnquiryCustomer table columns:');
        const columns = await sql.query`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryCustomer'
            ORDER BY ORDINAL_POSITION
        `;
        columns.recordset.forEach(c => {
            console.log(`  ${c.COLUMN_NAME} (${c.DATA_TYPE})`);
        });

        // Check EnquiryCustomer data for Enquiry 43
        console.log('\nEnquiryCustomer data for Enquiry 43:');
        const customers = await sql.query`
            SELECT * 
            FROM EnquiryCustomer 
            WHERE RequestNo = '43'
        `;
        customers.recordset.forEach(c => {
            console.log('\n  Customer:', c.CustomerName);
            Object.keys(c).forEach(key => {
                if (key !== 'CustomerName' && key !== 'RequestNo' && c[key]) {
                    console.log(`    ${key}: ${c[key]}`);
                }
            });
        });

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        sql.close();
    }
}

checkReceivedFromStructure();
