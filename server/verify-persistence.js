const { sql, connectDB } = require('./dbConfig');

const testPersistence = async () => {
    try {
        await connectDB();

        console.log('--- Step 1: Check Initial Count ---');
        const count1 = await sql.query`SELECT COUNT(*) as count FROM MasterEnquiryItems`;
        console.log('Count:', count1.recordset[0].count);

        console.log('--- Step 2: Insert Item ---');
        const testName = 'TestItem_' + Date.now();
        await sql.query`INSERT INTO MasterEnquiryItems (ItemName, CommonMailIds, CCMailIds) VALUES (${testName}, 'test@test.com', 'cc@test.com')`;
        console.log('Inserted:', testName);

        console.log('--- Step 3: Check Count Again ---');
        const count2 = await sql.query`SELECT COUNT(*) as count FROM MasterEnquiryItems`;
        console.log('Count:', count2.recordset[0].count);

        console.log('--- Step 4: Select the Item ---');
        const item = await sql.query`SELECT * FROM MasterEnquiryItems WHERE ItemName = ${testName}`;
        console.table(item.recordset);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

testPersistence();
