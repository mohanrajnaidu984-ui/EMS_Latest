const sql = require('mssql');
require('dotenv').config();

async function testEnquiry44Mapping() {
    try {
        await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: { encrypt: false, trustServerCertificate: true }
        });

        const requestNo = '44';

        // Get EnquiryMaster
        const enquiryResult = await sql.query`
            SELECT RequestNo, CustomerName, ReceivedFrom 
            FROM EnquiryMaster 
            WHERE RequestNo = ${requestNo}
        `;
        const enquiry = enquiryResult.recordset[0];

        console.log('=== Enquiry 44 Mapping Test ===\n');
        console.log('EnquiryMaster:');
        console.log('  CustomerName:', enquiry.CustomerName);
        console.log('  ReceivedFrom:', enquiry.ReceivedFrom);

        // Simulate the backend logic
        let customerOptions = [];
        let customerContacts = {};

        // From EnquiryCustomer
        const customerResult = await sql.query`
            SELECT CustomerName, ReceivedFrom 
            FROM EnquiryCustomer 
            WHERE RequestNo = ${requestNo}
        `;

        console.log('\nEnquiryCustomer records:');
        customerResult.recordset.forEach(row => {
            console.log(`  Customer: "${row.CustomerName}", ReceivedFrom: "${row.ReceivedFrom || 'NULL'}"`);

            if (row.CustomerName) {
                row.CustomerName.split(',').forEach(c => {
                    const trimmed = c.trim();
                    if (trimmed) {
                        customerOptions.push(trimmed);
                        if (row.ReceivedFrom) {
                            customerContacts[trimmed] = row.ReceivedFrom;
                        }
                    }
                });
            }
        });

        // From EnquiryMaster
        console.log('\nProcessing EnquiryMaster.CustomerName:');
        if (enquiry.CustomerName) {
            enquiry.CustomerName.split(',').forEach(c => {
                const trimmed = c.trim();
                console.log(`  Processing: "${trimmed}"`);
                if (trimmed) {
                    customerOptions.push(trimmed);
                    if (!customerContacts[trimmed] && enquiry.ReceivedFrom) {
                        customerContacts[trimmed] = enquiry.ReceivedFrom;
                        console.log(`    ✓ Mapped to ReceivedFrom: "${enquiry.ReceivedFrom}"`);
                    } else if (customerContacts[trimmed]) {
                        console.log(`    ✗ Already mapped to: "${customerContacts[trimmed]}"`);
                    } else {
                        console.log(`    ✗ No ReceivedFrom available`);
                    }
                }
            });
        }

        console.log('\n=== Final Results ===');
        console.log('Customer Options:', [...new Set(customerOptions)]);
        console.log('\nCustomer Contacts Mapping:');
        Object.keys(customerContacts).forEach(key => {
            console.log(`  "${key}" => "${customerContacts[key]}"`);
        });

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        sql.close();
    }
}

testEnquiry44Mapping();
