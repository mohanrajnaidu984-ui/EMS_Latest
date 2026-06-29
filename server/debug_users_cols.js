const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'");
        fs.writeFileSync('users_cols.txt', res.recordset.map(c => c.COLUMN_NAME).join(','));
        console.log("Done");
    } catch (err) { console.error(err); }
    process.exit(0);
};
run();
