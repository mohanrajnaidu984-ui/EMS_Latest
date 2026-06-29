
const { sql, poolPromise } = require('./dbConfig');

async function inspectTables() {
    try {
        const pool = await poolPromise;

        const tables = ['Enquiry', 'Master_EnquiryFor', 'Master_ConcernedSE'];

        for (const table of tables) {
            console.log(`\n--- Schema for ${table} ---`);
            const result = await pool.request()
                .input('tableName', sql.NVarChar, table)
                .query(`
                    SELECT COLUMN_NAME 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = @tableName
                `);

            result.recordset.forEach(row => console.log(row.COLUMN_NAME));
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

inspectTables();
