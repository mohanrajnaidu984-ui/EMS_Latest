const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query('SELECT RequestNo, SiteVisitDate FROM EnquiryMaster WHERE RequestNo IN (13,15,17)');
        fs.writeFileSync('visit_debug.txt', JSON.stringify(res.recordset, null, 2));
        console.log("Done");
    } catch (err) { console.error(err); }
    process.exit(0);
};
run();
