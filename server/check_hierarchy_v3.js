const { sql, dbConfig } = require('./dbConfig');
sql.connect(dbConfig, err => {
    if (err) return console.error(err);
    new sql.Request().query("SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = '13'", (err, res) => {
        if (err) console.error(err);
        else {
            res.recordset.forEach(r => console.log(`${r.ID} | ${r.ParentID} | ${r.ItemName}`));
        }
        sql.close();
    });
});
