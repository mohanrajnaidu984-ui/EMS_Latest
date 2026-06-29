const sql = require('mssql');
const config = require('./server/dbConfig');

async function run() {
    try {
        await sql.connect(config);

        console.log('--- Searching for Cebarco Bahrain ---');
        const res1 = await sql.query(`
            SELECT * FROM Master_CustomerName 
            WHERE CompanyName LIKE '%Cebarco%'
        `);
        console.table(res1.recordset);

        console.log('--- Searching for Customer with Electrical Email ---');
        const res2 = await sql.query(`
            SELECT * FROM Master_CustomerName 
            WHERE EmailId LIKE '%electrical@almoayyedcg.com%'
        `);
        console.table(res2.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

run();
