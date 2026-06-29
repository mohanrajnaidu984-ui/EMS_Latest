const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const data = await new sql.Request().query("SELECT * FROM EnquiryPricingValues WHERE RequestNo = '20'");
        data.recordset.forEach(r => {
            console.log(`REQ: ${r.RequestNo} | EF_ID: ${r.EnquiryForID} | EF_ITEM: ${r.EnquiryForItem} | PRICE: ${r.Price}`);
        });
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
