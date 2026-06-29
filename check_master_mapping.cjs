const { sql, connectDB } = require('./server/dbConfig');

async function check() {
    try {
        await connectDB();
        const res = await sql.query("SELECT ItemName, DepartmentName, CompanyName FROM Master_EnquiryFor");
        console.log("Master_EnquiryFor:", JSON.stringify(res.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
