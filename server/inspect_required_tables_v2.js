
const { sql, poolPromise } = require('./dbConfig');
const fs = require('fs');

async function inspectTables() {
    let output = '';
    try {
        const pool = await poolPromise;

        const tables = ['Enquiry', 'Master_EnquiryFor', 'Master_ConcernedSE'];

        for (const table of tables) {
            output += `\n--- Schema for ${table} ---\n`;
            const result = await pool.request()
                .input('tableName', sql.NVarChar, table)
                .query(`
                    SELECT COLUMN_NAME 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = @tableName
                `);

            result.recordset.forEach(row => {
                output += row.COLUMN_NAME + '\n';
            });
        }

        fs.writeFileSync('schema_inspection.txt', output);
        console.log('Schema written to schema_inspection.txt');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

inspectTables();
