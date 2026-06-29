const { sql, connectDB } = require('./dbConfig');

async function checkMaster() {
    try {
        await connectDB();
        const res = await sql.query`SELECT ItemName, CommonMailIds, CCMailIds FROM Master_EnquiryFor WHERE ItemName LIKE '%AC Maint%'`;
        console.log('Master Results:', JSON.stringify(res.recordset, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkMaster();
