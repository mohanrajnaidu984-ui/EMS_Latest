const sql = require('mssql/msnodesqlv8');
const config = {
    server: 'localhost',
    database: 'EMS_DB',
    driver: 'msnodesqlv8',
    options: { trustedConnection: true }
};

sql.connect(config, err => {
    if (err) {
        console.error(err);
        return;
    }
    const request = new sql.Request();
    request.query("SELECT * FROM EnquiryQuotes WHERE RequestNo='13'", (err, result) => {
        if (err) console.error(err);
        else {
            result.recordset.forEach(q => {
                console.log(`QuoteNumber: ${q.QuoteNumber}, ToName: ${q.ToName}`);
            });
        }
        sql.close();
    });
});
