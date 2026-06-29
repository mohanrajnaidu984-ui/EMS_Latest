require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

async function listTables() {
    try {
        await connectDB();
        const result = await new sql.Request().query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`);
        console.log('Tables:', result.recordset.map(r => r.TABLE_NAME));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listTables();
