const { sql, connectDB } = require('./dbConfig');
const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query("SELECT * FROM Master_ConcernedSE WHERE EmailId = 'mohan.naidu@almoayyedcg.com'");
        console.log(JSON.stringify(res.recordset, null, 2));
    } catch (err) { console.error(err); }
    process.exit(0);
};
run();
