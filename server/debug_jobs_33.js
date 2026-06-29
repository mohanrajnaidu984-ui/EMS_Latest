const { sql, connectDB } = require('./dbConfig');
const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query(`
            SELECT EF.*, MEF.CommonMailIds, MEF.CCMailIds 
            FROM EnquiryFor EF 
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo = '33'
        `);
        console.log(JSON.stringify(res.recordset, null, 2));
    } catch (err) { console.error(err); }
    process.exit(0);
};
run();
