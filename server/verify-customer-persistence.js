const axios = require('axios');
const { sql, connectDB } = require('./dbConfig');

const verifyCustomerPersistence = async () => {
    try {
        // 1. Add Customer via API
        const testCustomer = {
            Category: 'Contractor',
            CompanyName: 'Test Corp ' + Date.now(),
            Address1: '123 Test St',
            Address2: 'Suite 100',
            Rating: '5 Star',
            Type: 'MEP',
            FaxNo: '123-456',
            Phone1: '999-888',
            Phone2: '777-666',
            MailId: 'test@corp.com',
            Website: 'www.testcorp.com',
            Status: 'Active'
        };

        console.log('Adding Customer:', testCustomer.CompanyName);
        await axios.post('http://localhost:5000/api/customers', testCustomer);

        // 2. Verify in DB
        await connectDB();
        const result = await sql.query`SELECT * FROM Customers WHERE CompanyName = ${testCustomer.CompanyName}`;
        const saved = result.recordset[0];

        console.log('--- Verification Results ---');
        console.log('CompanyName:', saved.CompanyName === testCustomer.CompanyName ? 'OK' : 'FAIL');
        console.log('Address2:', saved.Address2 === testCustomer.Address2 ? 'OK' : 'FAIL');
        console.log('Rating:', saved.Rating === testCustomer.Rating ? 'OK' : 'FAIL');
        console.log('CustomerType:', saved.CustomerType === testCustomer.Type ? 'OK' : 'FAIL');
        console.log('FaxNo:', saved.FaxNo === testCustomer.FaxNo ? 'OK' : 'FAIL');
        console.log('Phone2:', saved.Phone2 === testCustomer.Phone2 ? 'OK' : 'FAIL');
        console.log('Email:', saved.Email === testCustomer.MailId ? 'OK' : 'FAIL');
        console.log('Website:', saved.Website === testCustomer.Website ? 'OK' : 'FAIL');

        process.exit(0);
    } catch (err) {
        console.error('Verification Failed:', err.message);
        if (err.response) {
            console.error('Server Response:', err.response.data);
        }
        process.exit(1);
    }
};

verifyCustomerPersistence();
