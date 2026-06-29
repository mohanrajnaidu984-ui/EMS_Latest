const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query('SELECT ItemName, CommonMailIds, CCMailIds FROM Master_EnquiryFor');
        fs.writeFileSync('mef_debug.txt', JSON.stringify(res.recordset, null, 2));
        console.log("Done");
    } catch (err) { console.error(err); }
    process.exit(0);
};
run();
