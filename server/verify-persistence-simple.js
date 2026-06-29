const { sql, connectDB } = require('./dbConfig');

const testPersistence = async () => {
    try {
        await connectDB();

        console.log('--- Step 1: Check Initial Count ---');
        const r1 = await new sql.Request().query('SELECT COUNT(*) as count FROM MasterEnquiryItems');
        console.log('Count 1:', r1.recordset[0].count);

        console.log('--- Step 2: Insert Item ---');
        const testName = 'TestItem_' + Date.now();
        const r2 = await new sql.Request()
            .input('name', sql.NVarChar, testName)
            .query('INSERT INTO MasterEnquiryItems (ItemName, CommonMailIds, CCMailIds) VALUES (@name, \'test@test.com\', \'cc@test.com\')');
        console.log('Rows Affected:', r2.rowsAffected);

        console.log('--- Step 3: Check Count Again ---');
        const r3 = await new sql.Request().query('SELECT COUNT(*) as count FROM MasterEnquiryItems');
        console.log('Count 2:', r3.recordset[0].count);

        process.exit(0);
    } catch (err) {
        console.error('ERROR:', err);
        process.exit(1);
    }
};

testPersistence();
