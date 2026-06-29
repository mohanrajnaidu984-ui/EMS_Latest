const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
};

async function run() {
    await sql.connect(config);

    console.log('\n=== EnquiryFor rows for RequestNo=14 (with LEFT JOIN Master_EnquiryFor) ===');
    const r1 = await sql.query`SELECT EF.ID, EF.ParentID, EF.ItemName, MEF.CommonMailIds, MEF.CCMailIds
        FROM EnquiryFor EF
        LEFT JOIN Master_EnquiryFor MEF ON (
            EF.ItemName = MEF.ItemName OR 
            (EF.ItemName LIKE 'L[0-9] - %' AND SUBSTRING(EF.ItemName, 6, LEN(EF.ItemName)) = MEF.ItemName) OR
            (EF.ItemName LIKE 'Sub Job - %' AND SUBSTRING(EF.ItemName, 11, LEN(EF.ItemName)) = MEF.ItemName)
        )
        WHERE EF.RequestNo = 14`;
    r1.recordset.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== All Master_EnquiryFor - ItemName + CommonMailIds ===');
    const r2 = await sql.query`SELECT ItemName, CommonMailIds, CCMailIds FROM Master_EnquiryFor`;
    r2.recordset.forEach(r => console.log(r.ItemName, '|', (r.CommonMailIds || 'NULL').substring(0, 80)));

    console.log('\n=== Electrical user in Master_ConcernedSE ===');
    const r3 = await sql.query`SELECT EmailId, FullName, Department, Roles FROM Master_ConcernedSE`;
    r3.recordset.forEach(r => console.log(JSON.stringify(r)));

    process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
