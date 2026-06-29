const { connectDB, sql } = require('./dbConfig');

const runVerification = async () => {
    try {
        console.log('--- START VERIFICATION 3 ---');

        // 1. Create User
        const uniqueName = `Test User ${Date.now()}`;
        const newUser = {
            FullName: uniqueName,
            Designation: 'Tester',
            EmailId: `test${Date.now()}@example.com`,
            LoginPassword: 'password123',
            Status: 'Active',
            Department: 'IT',
            Roles: 'User',
            RequestNo: 'REQ-TEST', // Dummy
            ModifiedBy: 'AdminVerifier'
        };

        console.log('1. Creating User...');
        const resPost = await fetch('http://localhost:5000/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newUser)
        });

        if (!resPost.ok) throw new Error(`POST failed: ${resPost.statusText}`);
        const dataPost = await resPost.json();
        console.log('   User Created. Response:', dataPost);

        if (!dataPost.id) throw new Error('   FAIL: API did not return ID');
        const userId = dataPost.id;
        console.log(`   PASS: Returned ID ${userId}`);

        // 2. Check Welcome Notification
        await connectDB();
        const notif1 = await sql.query`SELECT TOP 1 * FROM Notifications WHERE UserID = ${userId} ORDER BY ID DESC`;
        if (notif1.recordset.length > 0 && notif1.recordset[0].Message.includes('Welcome')) {
            console.log('   PASS: Welcome Notification Found:', notif1.recordset[0].Message);
        } else {
            console.error('   FAIL: Welcome Notification NOT found');
        }

        // 3. Update User Roles
        console.log('2. Updating User Roles...');
        const updatePayload = {
            ...newUser,
            Roles: ['User', 'Admin'], // Change roles
            ModifiedBy: 'AdminVerifier'
        };

        const resPut = await fetch(`http://localhost:5000/api/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
        });

        if (!resPut.ok) throw new Error(`PUT failed: ${resPut.statusText}`);
        const dataPut = await resPut.json();
        console.log('   User Updated. Response:', dataPut);

        // 4. Check Role Update Notification
        const notif2 = await sql.query`SELECT TOP 1 * FROM Notifications WHERE UserID = ${userId} ORDER BY ID DESC`;
        if (notif2.recordset.length > 0 && notif2.recordset[0].Message.includes('roles have been updated')) {
            console.log('   PASS: Role Update Notification Found:', notif2.recordset[0].Message);
        } else {
            console.error('   FAIL: Role Update Notification NOT found. Last notif:', notif2.recordset[0]?.Message);
        }

        console.log('--- VERIFICATION COMPLETE ---');
        process.exit(0);
    } catch (err) {
        console.error('ERROR:', err);
        process.exit(1);
    }
};

runVerification();
