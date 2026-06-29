const sql = require('mssql');
const { config } = require('./dbConfig');

sql.connect(config).then(() => {
    return sql.query("SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo='13'");
}).then(r => {
    console.log(r.recordset);
    process.exit();
}).catch(e => {
    console.error(e);
    process.exit(1);
});
