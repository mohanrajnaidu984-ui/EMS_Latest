const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const data = await new sql.Request().query("SELECT TOP 20 EnquiryForID, EnquiryForItem, Price FROM EnquiryPricingValues");
        data.recordset.forEach(r => {
            console.log(`ID: ${r.EnquiryForID} | ITEM: ${r.EnquiryForItem} | PRICE: ${r.Price}`);
        });
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
