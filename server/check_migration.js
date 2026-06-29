const { connectDB, sql } = require('./dbConfig');

async function check() {
    try {
        await connectDB();
        console.log('Connected.');

        const result = await sql.query`SELECT ID, ItemName, LeadJobCode FROM EnquiryFor ORDER BY ID`;
        console.log('ID | ItemName | LeadJobCode');
        console.log('---|---|---');
        result.recordset.forEach(row => {
            console.log(`${row.ID} | ${row.ItemName} | ${row.LeadJobCode}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

check();
