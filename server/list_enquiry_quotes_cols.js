const { sql, dbConfig } = require('./dbConfig');
sql.connect(dbConfig, err => {
    if (err) return console.error(err);
    new sql.Request().query("SELECT TOP 1 * FROM EnquiryQuotes", (err, res) => {
        if (err) console.error(err);
        else console.log(JSON.stringify(res.recordset, null, 2));
        sql.close();
    });
});
