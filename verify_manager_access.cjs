const { connectDB, sql } = require('./server/dbConfig');

async function check() {
    try {
        await connectDB();
        const email = 'mohan.naidu@almoayyedcg.com';
        console.log(`Checking manager access for: ${email}`);

        const request = new sql.Request();
        request.input('email', sql.NVarChar, `%${email}%`);

        const result = await request.query(`
            SELECT DISTINCT DepartmentName 
            FROM Master_EnquiryFor 
            WHERE CCMailIds LIKE @email
        `);

        console.log('Managed Divisions:', result.recordset);

        const adminCheck = await new sql.Request().query(`SELECT Roles FROM Master_ConcernedSE WHERE EmailId = '${email}'`);
        console.log('Admin Check Results:', adminCheck.recordset);

        const roles = adminCheck.recordset[0]?.Roles || '';
        const isAdmin = roles.toLowerCase().includes('admin');
        console.log('Is Admin (calculated):', isAdmin);

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
