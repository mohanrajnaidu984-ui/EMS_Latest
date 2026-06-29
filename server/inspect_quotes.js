const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryQuotes'");
        console.log(JSON.stringify(res.recordset.map(c => c.COLUMN_NAME)));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
