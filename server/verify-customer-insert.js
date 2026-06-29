const { sql, connectDB } = require('./dbConfig');

const verifyCustomerInsert = async () => {
    try {
        await connectDB();
        console.log('Connected to DB');

        const testCustomer = {
            CompanyName: 'Direct Test Corp ' + Date.now(),
            Address1: '123 Test St',
            Address2: 'Suite 100',
            Rating: '5 Star',
            Type: 'MEP',
            FaxNo: '123-456',
            Phone1: '999-888',
            Phone2: '777-666',
            MailId: 'test@corp.com',
            Website: 'www.testcorp.com',
            Status: 'Active',
            Category: 'Contractor'
        };

        const request = new sql.Request();
        request.input('CompanyName', sql.NVarChar, testCustomer.CompanyName);
        request.input('Address1', sql.NVarChar, testCustomer.Address1);
        request.input('Address2', sql.NVarChar, testCustomer.Address2);
        request.input('Rating', sql.NVarChar, testCustomer.Rating);
        request.input('CustomerType', sql.NVarChar, testCustomer.Type);
        request.input('FaxNo', sql.NVarChar, testCustomer.FaxNo);
        request.input('Phone1', sql.NVarChar, testCustomer.Phone1);
        request.input('Phone2', sql.NVarChar, testCustomer.Phone2);
        request.input('Email', sql.NVarChar, testCustomer.MailId);
        request.input('Website', sql.NVarChar, testCustomer.Website);
        request.input('Status', sql.NVarChar, testCustomer.Status);
        request.input('Category', sql.NVarChar, testCustomer.Category);

        // Try with CustomerName
        console.log('Attempting INSERT with CustomerName...');
        await request.query(`INSERT INTO Customers (CompanyName, CustomerName, Address1, Address2, Rating, CustomerType, FaxNo, Phone1, Phone2, Email, Website, Status, Category) 
                        VALUES (@CompanyName, @CompanyName, @Address1, @Address2, @Rating, @CustomerType, @FaxNo, @Phone1, @Phone2, @Email, @Website, @Status, @Category)`);

        console.log('INSERT Successful!');
        process.exit(0);
    } catch (err) {
        console.error('INSERT Failed:', err);
        console.error('SQL Error details:', err.originalError?.info || err.message);
        process.exit(1);
    }
};

verifyCustomerInsert();
