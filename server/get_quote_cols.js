const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryQuotes'");
        console.log("COLUMNS START");
        res.recordset.forEach(c => console.log(c.COLUMN_NAME));
        console.log("COLUMNS END");
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
