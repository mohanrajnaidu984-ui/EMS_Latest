const { connectDB, sql } = require('./dbConfig');

async function listUsers() {
    try {
        await connectDB();
        const res = await sql.query`SELECT TOP 20 Designation, Department, FullName, EmailId, Roles FROM Master_ConcernedSE`;
        console.log(JSON.stringify(res.recordset, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        setTimeout(() => process.exit(0), 1000);
    }
}

listUsers();
