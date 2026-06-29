const { sql, connectDB } = require('./dbConfig');
async function run() {
    await connectDB();
    const request = new sql.Request();

    let res = await request.query(`SELECT * FROM ConcernedSE WHERE RequestNo='11'`);
    console.log("ConcernedSE:");
    console.table(res.recordset);

    process.exit(0);
}
run();
