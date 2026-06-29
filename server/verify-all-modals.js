const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected to DB');

        // --- CUSTOMER TEST ---
        try {
            console.log('\n--- TESTING CUSTOMER ---');
            await sql.query`INSERT INTO Customers (CustomerName, CompanyName, Address1, Phone1, Category, Status) VALUES ('Test Cust Name', 'Test Cust Co', 'Addr1', '123', 'Client', 'Active')`;
            let custRes = await sql.query`SELECT * FROM Customers WHERE CustomerName = 'Test Cust Name'`;
            let cust = custRes.recordset[0];
            console.log('Inserted Customer:', cust);

            if (cust) {
                await sql.query`UPDATE Customers SET Address1='Addr1 UPDATED', Phone1='999' WHERE CustomerID=${cust.CustomerID}`;
                custRes = await sql.query`SELECT * FROM Customers WHERE CustomerID = ${cust.CustomerID}`;
                console.log('Updated Customer:', custRes.recordset[0]);
                await sql.query`DELETE FROM Customers WHERE CustomerID=${cust.CustomerID}`;
                console.log('Deleted Customer');
            }
        } catch (e) { console.error('Customer Test Failed:', e.message); }

        // --- CONTACT TEST ---
        try {
            console.log('\n--- TESTING CONTACT ---');
            await sql.query`INSERT INTO Customers (CustomerName, CompanyName) VALUES ('Temp Cust', 'Temp Co')`;
            let tempCustRes = await sql.query`SELECT CustomerID FROM Customers WHERE CustomerName = 'Temp Cust'`;
            let tempCustID = tempCustRes.recordset[0].CustomerID;

            await sql.query`INSERT INTO Contacts (CustomerID, ContactName, Designation, Email, Status) VALUES (${tempCustID}, 'Test Contact', 'Desig', 'test@test.com', 'Active')`;
            let contRes = await sql.query`SELECT * FROM Contacts WHERE ContactName = 'Test Contact'`;
            let cont = contRes.recordset[0];
            console.log('Inserted Contact:', cont);

            if (cont) {
                await sql.query`UPDATE Contacts SET Designation='Desig UPDATED' WHERE ContactID=${cont.ContactID}`;
                contRes = await sql.query`SELECT * FROM Contacts WHERE ContactID = ${cont.ContactID}`;
                console.log('Updated Contact:', contRes.recordset[0]);
                await sql.query`DELETE FROM Contacts WHERE ContactID=${cont.ContactID}`;
                console.log('Deleted Contact');
            }
            await sql.query`DELETE FROM Customers WHERE CustomerID=${tempCustID}`;
        } catch (e) { console.error('Contact Test Failed:', e.message); }

        // --- USER TEST ---
        try {
            console.log('\n--- TESTING USER ---');
            const uniqueEmail = `test_${Date.now()}@test.com`;
            await sql.query`INSERT INTO Users (FullName, Designation, Email, LoginPassword, Status, Department, Roles) VALUES ('Test User', 'Eng', ${uniqueEmail}, 'pass', 'Active', 'MEP', 'Admin')`;
            let userRes = await sql.query`SELECT * FROM Users WHERE Email = ${uniqueEmail}`;
            let user = userRes.recordset[0];
            console.log('Inserted User:', user);

            if (user) {
                await sql.query`UPDATE Users SET Designation='Eng UPDATED' WHERE UserID=${user.UserID}`;
                userRes = await sql.query`SELECT * FROM Users WHERE UserID = ${user.UserID}`;
                console.log('Updated User:', userRes.recordset[0]);
                await sql.query`DELETE FROM Users WHERE UserID=${user.UserID}`;
                console.log('Deleted User');
            }
        } catch (e) { console.error('User Test Failed:', e.message); }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

run();
