const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

async function listTables() {
    try {
        await connectDB();
        const result = await sql.query`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
        `;
        const tables = result.recordset.map(t => t.TABLE_NAME);
        fs.writeFileSync('tables_full.json', JSON.stringify(tables, null, 2));
        console.log('Tables written to tables_full.json');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listTables();
