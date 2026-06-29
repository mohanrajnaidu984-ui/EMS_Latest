const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const data = await new sql.Request().query("SELECT * FROM EnquiryPricingOptions WHERE RequestNo = '20'");
        console.log(JSON.stringify(data.recordset, null, 2));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
