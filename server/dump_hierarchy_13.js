const { sql, dbConfig } = require('./dbConfig');
const fs = require('fs');
sql.connect(dbConfig, err => {
    if (err) return console.error(err);
    new sql.Request().query("SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = '13' ORDER BY ID", (err, res) => {
        if (err) console.error(err);
        else {
            let output = res.recordset.map(r => `${r.ID} | ${r.ParentID} | ${r.ItemName}`).join('\n');
            fs.writeFileSync('hierarchy_full_13.txt', output);
            console.log("Dumped to hierarchy_full_13.txt");
        }
        sql.close();
    });
});
