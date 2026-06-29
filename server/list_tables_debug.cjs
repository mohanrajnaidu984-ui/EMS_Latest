const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function listTables() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected to DB');

        const result = await sql.query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        `);

        console.log('\n--- Tables ---');
        result.recordset.forEach(row => console.log(row.TABLE_NAME));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

listTables();
