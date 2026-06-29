const { sql, connectDB } = require('./dbConfig');

async function checkUsers() {
    try {
        await connectDB();
        const res = await sql.query`SELECT FullName, Department, Roles FROM Master_ConcernedSE`;
        console.log('User List count:', res.recordset.length);
        const civilUsers = res.recordset.filter(u => (u.Department || '').toLowerCase().includes('civil'));
        console.log('Civil Users:', JSON.stringify(civilUsers, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkUsers();
