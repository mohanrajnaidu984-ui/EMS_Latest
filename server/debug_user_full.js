const { connectDB, sql } = require('./dbConfig');

async function test() {
    try {
        await connectDB();
        const result = await sql.query('SELECT * FROM Master_ConcernedSE WHERE EmailId = \'electrical@almoayyedcg.com\'');
        console.log(JSON.stringify(result.recordset, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

test();
