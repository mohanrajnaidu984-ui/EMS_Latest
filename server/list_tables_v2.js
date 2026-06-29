const { connectDB, sql } = require('./dbConfig');

async function listTables() {
    try {
        await connectDB();
        console.log('Connected to DB');

        const result = await sql.query`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        `;
        result.recordset.forEach(r => console.log('TABLE:', r.TABLE_NAME));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

listTables();
