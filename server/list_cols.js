const { sql, dbConfig } = require('./dbConfig');
sql.connect(dbConfig, err => {
    if (err) return console.error(err);
    new sql.Request().query("SELECT TOP 1 * FROM EnquiryPricingOptions", (err, res) => {
        if (err) console.error(err);
        else console.log(Object.keys(res.recordset[0]));
        sql.close();
    });
});
