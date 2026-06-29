const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query(`
            SELECT EF.ID, EF.ParentID, EF.ItemName, MEF.CommonMailIds, MEF.CCMailIds 
            FROM EnquiryFor EF 
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo = '33'
        `);
        fs.writeFileSync('request_33_jobs.json', JSON.stringify(res.recordset, null, 2));
        console.log("Done");
    } catch (err) { console.error(err); }
    process.exit(0);
};
run();
