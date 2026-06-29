const sql = require('mssql');
const fs = require('fs');
const config = { user: 'bmsuser', password: 'bms@acg123', server: '151.50.1.116', database: 'EMS_DB', options: { encrypt: false, trustServerCertificate: true } };
async function run() {
    await sql.connect(config);
    const jobs = (await sql.query("SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo='16' ORDER BY ID")).recordset;
    const users = (await sql.query("SELECT FullName, EmailId, Roles FROM Master_ConcernedSE")).recordset;
    const elecUsers = users.filter(u => (u.EmailId || '').toLowerCase().includes('electr') || (u.FullName || '').toLowerCase().includes('electr'));
    const opts = (await sql.query("SELECT ID, OptionName, ItemName, CustomerName, LeadJobName FROM EnquiryPricingOptions WHERE RequestNo='16'")).recordset;
    const vals = (await sql.query("SELECT OptionID, EnquiryForID, EnquiryForItem, Price, CustomerName FROM EnquiryPricingValues WHERE RequestNo='16'")).recordset;
    const masters = [];
    for (const j of jobs) {
        const r = (await sql.query(`SELECT TOP 1 ItemName, CommonMailIds, CCMailIds FROM Master_EnquiryFor WHERE ItemName='${j.ItemName.replace(/'/g, "''")}'`)).recordset;
        if (r.length) masters.push(r[0]);
        else {
            const clean = j.ItemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
            const r2 = (await sql.query(`SELECT TOP 1 ItemName, CommonMailIds, CCMailIds FROM Master_EnquiryFor WHERE ItemName='${clean.replace(/'/g, "''")}'`)).recordset;
            if (r2.length) masters.push({ jobRef: j.ItemName, ...r2[0] });
        }
    }
    const out = {
        jobs,
        elecUsers,
        opts,
        vals,
        masters
    };
    fs.writeFileSync('debug_result.json', JSON.stringify(out, null, 2));
    console.log('Written to debug_result.json');
    await sql.close();
}
run().catch(e => { console.error(e.message); process.exit(1); });
