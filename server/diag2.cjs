const sql = require('mssql');
require('dotenv').config();
const cfg = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
};
sql.connect(cfg).then(async () => {
    const r = await sql.query("SELECT EF.ID, EF.ParentID, EF.ItemName, MEF.CommonMailIds FROM EnquiryFor EF LEFT JOIN Master_EnquiryFor MEF ON EF.ItemName = MEF.ItemName WHERE EF.RequestNo = 14");
    console.log('=== Enquiry 14 items + CommonMailIds ===');
    r.recordset.forEach(x => console.log(x.ID, '|', x.ParentID, '|', x.ItemName, '|', x.CommonMailIds));

    const u = await sql.query("SELECT EmailId, Department FROM Master_ConcernedSE");
    console.log('=== All ConcernedSE users ===');
    u.recordset.forEach(x => console.log(x.EmailId, '|', x.Department));

    const m = await sql.query("SELECT ItemName, CommonMailIds FROM Master_EnquiryFor");
    console.log('=== All Master_EnquiryFor ===');
    m.recordset.forEach(x => console.log(x.ItemName, '|', (x.CommonMailIds || 'NULL')));

    process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
