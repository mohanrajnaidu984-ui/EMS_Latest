const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const data = await new sql.Request().query("SELECT ID, RequestNo, OptionName FROM EnquiryPricingOptions WHERE ID = 24");
        data.recordset.forEach(r => console.log(`ID: ${r.ID} | REQ: ${r.RequestNo} | NAME: ${r.OptionName}`));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
