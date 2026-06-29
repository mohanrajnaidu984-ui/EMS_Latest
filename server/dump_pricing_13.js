const { sql, dbConfig } = require('./dbConfig');
const fs = require('fs');
sql.connect(dbConfig, err => {
    if (err) return console.error(err);
    new sql.Request().query("SELECT OptionID, EnquiryForItem, EnquiryForID, Price FROM EnquiryPricingValues WHERE RequestNo = '13'", (err, res) => {
        if (err) console.error(err);
        else {
            fs.writeFileSync('pricing_dump_13.txt', JSON.stringify(res.recordset, null, 2));
            console.log("Dumped to pricing_dump_13.txt");
        }
        sql.close();
    });
});
