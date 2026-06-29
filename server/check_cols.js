const sql = require('mssql');

const dbConfig = {
    user: 'bmsuser',
    password: 'bms@acg123',
    server: '151.50.1.116',
    database: 'EMS_DB',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function checkColumns() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT TOP 0 * FROM Master_ConcernedSE`;
        console.log('Master_ConcernedSE columns:', result.recordset.columns);

        const result2 = await sql.query`SELECT TOP 1 * FROM Master_ConcernedSE WHERE FullName LIKE '%Civil%' OR FullName LIKE '%Electrical%'`;
        console.table(result2.recordset);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkColumns();
