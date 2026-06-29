const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query(`
            SELECT RequestNo, ProjectName, Status 
            FROM EnquiryMaster 
            WHERE RequestNo IN ('13', '15', '17')
        `);
        console.log(JSON.stringify(res.recordset, null, 2));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
