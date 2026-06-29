const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const data = await new sql.Request().query("SELECT OptionID FROM EnquiryPricingValues WHERE RequestNo = '20'");
        data.recordset.forEach(r => console.log(`OPT_ID: ${r.OptionID}`));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
