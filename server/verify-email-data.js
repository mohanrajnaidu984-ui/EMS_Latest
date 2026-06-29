const { sql, connectDB } = require('./dbConfig');

const verifyEmailData = async () => {
    try {
        await connectDB();

        console.log('--- MasterEnquiryItems ---');
        const items = await sql.query`SELECT * FROM MasterEnquiryItems`;
        console.log('Count:', items.recordset.length);
        console.table(items.recordset);

        console.log('\n--- Users ---');
        const users = await sql.query`SELECT * FROM Users`;
        console.log('Count:', users.recordset.length);
        console.table(users.recordset);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

verifyEmailData();
