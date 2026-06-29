const { connectDB, sql } = require('./dbConfig');

async function checkHyperlinksSchema() {
    try {
        await connectDB();
        const res = await sql.query`
            SELECT COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'Hyperlinks'
        `;
        if (res.recordset.length === 0) {
            console.log('Hyperlinks table does not exist.');
        } else {
            console.log('--- Hyperlinks Table Columns ---');
            res.recordset.forEach(row => {
                console.log(`${row.COLUMN_NAME}: ${row.DATA_TYPE}`);
            });
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkHyperlinksSchema();
