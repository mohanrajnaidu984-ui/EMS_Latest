const { connectDB, sql } = require('./server/dbConfig');

async function run() {
    try {
        await connectDB();

        // Update BMS department to include the user in CCMailIds
        // We will append or overwrite. Since it's a demo, replacing is safest or appending if we care about existing.
        // Existing is 'electrical_HOD@almoayyedcg.com'.
        // Let's make it 'electrical_HOD@almoayyedcg.com,mohan.naidu@almoayyedcg.com' or just replace if easier.
        // Given earlier prompt about "users are the managers...they will be setting targets", I should probably append.

        const dept = 'BMS';
        const newEmail = 'mohan.naidu@almoayyedcg.com';

        const current = await sql.query(`SELECT CCMailIds FROM Master_EnquiryFor WHERE DepartmentName = '${dept}'`);
        let specificId = current.recordset[0].CCMailIds;

        let newIds = specificId;
        if (!specificId) {
            newIds = newEmail;
        } else if (!specificId.includes(newEmail)) {
            newIds = specificId + ',' + newEmail;
        }

        console.log(`Updating ${dept} CCMailIds from '${specificId}' to '${newIds}'`);

        const updateReq = new sql.Request();
        updateReq.input('ids', sql.NVarChar, newIds);
        await updateReq.query(`UPDATE Master_EnquiryFor SET CCMailIds = @ids WHERE DepartmentName = '${dept}'`);

        console.log('Update successful.');

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

run();
