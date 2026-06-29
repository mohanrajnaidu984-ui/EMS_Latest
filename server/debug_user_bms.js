const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query("SELECT Name, EmailId, Roles FROM Users WHERE EmailId = 'bms.manager@almoayyedcg.com'");
        fs.writeFileSync('user_debug.txt', JSON.stringify(res.recordset, null, 2));
        console.log("Done");
    } catch (err) { console.error(err); }
    process.exit(0);
};
run();
