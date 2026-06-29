const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'");
        res.recordset.forEach(t => console.log("TABLE:" + t.TABLE_NAME));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
