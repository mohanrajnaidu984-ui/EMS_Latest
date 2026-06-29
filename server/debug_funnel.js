const { connectDB, sql } = require('./dbConfig');
async function test() {
    try {
        await connectDB();
        const res = await sql.query("SELECT ID, ItemName, DepartmentName FROM Master_EnquiryFor WHERE ItemName = 'Civil Project'");
        console.log('Duplicates:', JSON.stringify(res.recordset, null, 2));

        if (res.recordset.length > 1) {
            const idToDelete = res.recordset[1].ID;
            await sql.query(`DELETE FROM Master_EnquiryFor WHERE ID = ${idToDelete}`);
            console.log(`Deleted duplicate Master_EnquiryFor ID: ${idToDelete}`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}
test();
