const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
const run = async () => {
    try {
        await connectDB();
        const userEmail = 'bms.manager@almoayyedcg.com';

        const mcse = await new sql.Request().query(`SELECT * FROM Master_ConcernedSE WHERE EmailId = '${userEmail}'`);
        const users = await new sql.Request().query(`SELECT * FROM Users WHERE Email = '${userEmail}'`);

        const result = {
            Master_ConcernedSE: mcse.recordset,
            Users: users.recordset
        };

        fs.writeFileSync('pricing_user_debug_v2.txt', JSON.stringify(result, null, 2));
        console.log("Done");
    } catch (err) { console.error(err); }
    process.exit(0);
};
run();
