const { sql, connectDB } = require('./dbConfig');
const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query("SELECT RequestNo, Status, CreatedBy FROM EnquiryMaster WHERE Status IN ('Open', 'Enquiry', '', 'FollowUp') OR Status IS NULL");
        console.log(JSON.stringify(res.recordset, null, 2));
    } catch (err) { console.error(err); }
    process.exit(0);
};
run();
