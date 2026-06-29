const { connectDB, sql } = require('./dbConfig');

async function run() {
    try {
        await connectDB();
        const res = await sql.query(`SELECT FullName, Roles, Department, EmailId FROM Master_ConcernedSE WHERE EmailId LIKE '%ELE%'`);
        console.table(res.recordset);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
run();
