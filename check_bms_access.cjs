const { connectDB, sql } = require('./server/dbConfig');

async function run() {
    try {
        await connectDB();
        const email = 'mohan.naidu@almoayyedcg.com';
        console.log(`Checking access for: ${email}`);

        // 1. Check Manager Access (CCMailIds)
        const request = new sql.Request();
        request.input('email', sql.NVarChar, `%${email}%`);
        const resManager = await request.query(`
            SELECT DepartmentName, CCMailIds 
            FROM Master_EnquiryFor 
            WHERE CCMailIds LIKE @email
        `);
        console.log('Manager Access found:', resManager.recordset);

        // 2. Check User Roles
        const resUser = await sql.query(`SELECT roles FROM Master_ConcernedSE WHERE EmailId = '${email}'`);
        console.log('User Roles found:', resUser.recordset);

        // 3. Check BMS division
        const resBMS = await sql.query("SELECT DepartmentName, CCMailIds FROM Master_EnquiryFor WHERE DepartmentName LIKE '%BMS%'");
        console.log('BMS Division Info:', resBMS.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

run();
