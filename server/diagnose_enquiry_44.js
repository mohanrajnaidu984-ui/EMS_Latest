const sql = require('mssql');
require('dotenv').config();

async function diagnoseEnquiry44() {
    try {
        await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: { encrypt: false, trustServerCertificate: true }
        });

        console.log('=== Diagnosing Enquiry 44 ===\n');

        // Check EnquiryMaster
        console.log('1. EnquiryMaster:');
        const master = await sql.query`
            SELECT RequestNo, CustomerName, ReceivedFrom 
            FROM EnquiryMaster 
            WHERE RequestNo = '44'
        `;
        console.log('   CustomerName:', master.recordset[0]?.CustomerName);
        console.log('   ReceivedFrom:', master.recordset[0]?.ReceivedFrom);

        // Check EnquiryCustomer table structure
        console.log('\n2. EnquiryCustomer table columns:');
        const cols = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryCustomer'
            ORDER BY ORDINAL_POSITION
        `;
        console.log('   Columns:', cols.recordset.map(c => c.COLUMN_NAME).join(', '));

        // Check EnquiryCustomer data
        console.log('\n3. EnquiryCustomer data for Enquiry 44:');
        const customers = await sql.query`
            SELECT * 
            FROM EnquiryCustomer 
            WHERE RequestNo = '44'
        `;

        if (customers.recordset.length === 0) {
            console.log('   ⚠️  NO RECORDS FOUND in EnquiryCustomer for RequestNo 44');
        } else {
            customers.recordset.forEach((row, idx) => {
                console.log(`\n   Record ${idx + 1}:`);
                Object.keys(row).forEach(key => {
                    if (row[key] !== null && row[key] !== '') {
                        console.log(`     ${key}: ${row[key]}`);
                    }
                });
            });
        }

        // Check if there's a different table for customer contacts
        console.log('\n4. Checking for related tables:');
        const tables = await sql.query`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME LIKE '%Customer%' OR TABLE_NAME LIKE '%Received%'
            ORDER BY TABLE_NAME
        `;
        console.log('   Related tables:', tables.recordset.map(t => t.TABLE_NAME).join(', '));

    } catch (err) {
        console.error('Error:', err.message);
        console.error(err);
    } finally {
        sql.close();
    }
}

diagnoseEnquiry44();
