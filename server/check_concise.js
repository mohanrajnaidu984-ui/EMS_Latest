const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const config = {
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
    options: { encrypt: false, trustServerCertificate: true }
};
async function check() {
    await sql.connect(config);
    const po = await sql.query("SELECT * FROM EnquiryPricingOptions WHERE RequestNo = '45'");
    console.log('PO Count:', po.recordset.length);
    const pv = await sql.query("SELECT PV.* FROM EnquiryPricingValues PV JOIN EnquiryPricingOptions PO ON PV.OptionID = PO.ID WHERE PO.RequestNo = '45' AND PV.Price > 0");
    console.log('PV > 0 Count:', pv.recordset.length);
    if (pv.recordset.length > 0) console.log('Sample PV:', pv.recordset[0]);

    const ef = await sql.query("SELECT * FROM EnquiryFor WHERE RequestNo = '45'");
    console.log('EF Items:', ef.recordset.map(r => r.ItemName));

    const q = await sql.query("SELECT * FROM EnquiryQuotes WHERE RequestNo = '45'");
    console.log('Quotes Count:', q.recordset.length);

    process.exit(0);
}
check();
