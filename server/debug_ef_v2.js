const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const data = await new sql.Request().query("SELECT * FROM EnquiryFor WHERE RequestNo = '20'");
        data.recordset.forEach(r => {
            console.log(`EF_ID: ${r.ID} | ITEM: ${r.ItemName}`);
        });
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
