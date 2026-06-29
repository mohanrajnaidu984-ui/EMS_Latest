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

async function testCustomerUpdate() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(config);
        console.log('Connected!');

        // First, let's see what customers exist
        console.log('\n=== Existing Customers ===');
        const customers = await pool.request().query(`SELECT TOP 5 * FROM Master_CustomerName`);
        console.table(customers.recordset);

        if (customers.recordset.length > 0) {
            const testCustomer = customers.recordset[0];
            const testId = testCustomer.ID;

            console.log(`\n=== Testing UPDATE on ID: ${testId} ===`);
            console.log('Before update:', testCustomer);

            // Simulate the UPDATE from the API
            const CompanyName = testCustomer.CompanyName;
            const Address1 = testCustomer.Address1;
            const Address2 = testCustomer.Address2;
            const Rating = testCustomer.Rating;
            const Type = testCustomer.Type;
            const FaxNo = 'TEST-FAX-123';
            const Phone1 = testCustomer.Phone1;
            const Phone2 = 'TEST-PHONE2-456';
            const EmailId = 'test@example.com';
            const Website = 'https://test.example.com';
            const Status = testCustomer.Status;

            console.log('\nExecuting UPDATE with test values...');
            const result = await pool.request().query`
                UPDATE Master_CustomerName 
                SET CompanyName=${CompanyName}, 
                    Address1=${Address1}, 
                    Address2=${Address2}, 
                    Rating=${Rating}, 
                    Type=${Type}, 
                    FaxNo=${FaxNo}, 
                    Phone1=${Phone1}, 
                    Phone2=${Phone2}, 
                    EmailId=${EmailId}, 
                    Website=${Website}, 
                    Status=${Status} 
                WHERE ID=${testId}
            `;

            console.log('Rows affected:', result.rowsAffected);

            // Verify the update
            console.log('\n=== Verifying UPDATE ===');
            const verify = await pool.request().query`SELECT * FROM Master_CustomerName WHERE ID=${testId}`;
            console.log('After update:', verify.recordset[0]);

            if (verify.recordset[0].FaxNo === FaxNo &&
                verify.recordset[0].Phone2 === Phone2 &&
                verify.recordset[0].EmailId === EmailId &&
                verify.recordset[0].Website === Website) {
                console.log('\n✅ UPDATE SUCCESSFUL - All fields updated correctly!');
            } else {
                console.log('\n❌ UPDATE FAILED - Fields not updated:');
                console.log('Expected FaxNo:', FaxNo, 'Got:', verify.recordset[0].FaxNo);
                console.log('Expected Phone2:', Phone2, 'Got:', verify.recordset[0].Phone2);
                console.log('Expected EmailId:', EmailId, 'Got:', verify.recordset[0].EmailId);
                console.log('Expected Website:', Website, 'Got:', verify.recordset[0].Website);
            }
        } else {
            console.log('No customers found to test with.');
        }

        await pool.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

testCustomerUpdate();
