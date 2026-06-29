const { sql, connectDB, dbConfig } = require('./dbConfig');

async function checkTables() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Received%' OR TABLE_NAME LIKE '%Contact%'`;
        console.log('Tables:', JSON.stringify(result.recordset, null, 2));
    } catch (err) {
        console.error('DB Error:', err);
    } finally {
        await sql.close();
    }
}

checkTables();
