const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME");
        fs.writeFileSync('tables_list.json', JSON.stringify(res.recordset.map(r => r.TABLE_NAME), null, 2));
        console.log("Tables list written to tables_list.json");
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
