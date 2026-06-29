const { sql, dbConfig } = require('./dbConfig');
sql.connect(dbConfig, err => {
    if (err) return console.error(err);
    new sql.Request().query("SELECT ID, QuoteNumber, ToName, RequestNo, RevisionNo FROM EnquiryQuotes WHERE RequestNo = '13'", (err, res) => {
        if (err) console.error(err);
        else console.log(JSON.stringify(res.recordset, null, 2));
        sql.close();
    });
});
