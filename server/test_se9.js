const { sql, connectDB } = require('./dbConfig');
async function run() {
    await connectDB();
    const request = new sql.Request();

    let res = await request.query(`SELECT * FROM ConcernedSE WHERE RequestNo='9'`);
    console.log("ConcernedSE for 9:");
    console.table(res.recordset);

    process.exit(0);
}
run();
