const sql = require('mssql');
require('dotenv').config();

async function testReceivedFromQuery() {
    try {
        await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: { encrypt: false, trustServerCertificate: true }
        });

        const requestNo = '44';

        console.log('=== Testing ReceivedFrom Query for Enquiry 44 ===\n');

        // Query ReceivedFrom table
        const receivedFromResult = await sql.query`
            SELECT ContactName, CompanyName 
            FROM ReceivedFrom 
            WHERE RequestNo = ${requestNo}
        `;

        console.log('ReceivedFrom records:', receivedFromResult.recordset);

        // Build customerContacts mapping
        let customerContacts = {};
        receivedFromResult.recordset.forEach(row => {
            if (row.CompanyName && row.ContactName) {
                const company = row.CompanyName.trim();
                const contact = row.ContactName.trim();

                console.log(`Processing: Company="${company}", Contact="${contact}"`);

                if (customerContacts[company]) {
                    customerContacts[company] += ', ' + contact;
                } else {
                    customerContacts[company] = contact;
                }
            }
        });

        console.log('\nFinal customerContacts mapping:');
        console.log(JSON.stringify(customerContacts, null, 2));

        console.log('\nLookup test for "BEMCO":');
        console.log('  customerContacts["BEMCO"] =', customerContacts["BEMCO"]);

    } catch (err) {
        console.error('Error:', err.message);
        console.error(err);
    } finally {
        sql.close();
    }
}

testReceivedFromQuery();
