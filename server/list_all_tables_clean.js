const { connectDB, sql } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const result = await sql.query`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`;
        console.log('--- TABLES ---');
        result.recordset.forEach(row => console.log(row.TABLE_NAME));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
