const { sql, dbConfig } = require('./dbConfig');
const fs = require('fs');
sql.connect(dbConfig, err => {
    if (err) return console.error(err);
    new sql.Request().query("SELECT ID, QuoteNumber, ToName, RequestNo FROM EnquiryQuotes WHERE RequestNo = '13'", (err, res) => {
        if (err) console.error(err);
        else {
            let output = res.recordset.map(r => `${r.ID} | ${r.QuoteNumber} | ${r.ToName}`).join('\n');
            fs.writeFileSync('quotes_dump.txt', output);
            console.log("Dumped to quotes_dump.txt");
        }
        sql.close();
    });
});
