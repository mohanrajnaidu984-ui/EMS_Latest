const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query(`
            SELECT 
                EF.ID, EF.ItemName, EPV.Price
            FROM EnquiryFor EF
            LEFT JOIN EnquiryPricingValues EPV ON EF.ID = EPV.EnquiryForID
            WHERE EF.RequestNo = '20'
        `);
        console.log(JSON.stringify(res.recordset, null, 2));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
