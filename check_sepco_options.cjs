const sql = require('mssql');
const config = {
    user: 'bmsuser',
    password: 'bms@acg123',
    server: '151.50.1.116',
    database: 'EMS_DB',
    options: { encrypt: false, trustServerCertificate: true }
};

async function run() {
    try {
        await sql.connect(config);
        const options = (await sql.query("SELECT ID, OptionName, CustomerName FROM EnquiryPricingOptions WHERE RequestNo = '51'")).recordset;

        let counts = { SEPCO: 0, Civil: 0, Null: 0, Other: 0 };
        options.forEach(o => {
            const cust = o.CustomerName || '';
            if (!cust) counts.Null++;
            else if (cust.includes('SEPCO')) counts.SEPCO++;
            else if (cust.includes('Civil')) counts.Civil++;
            else counts.Other++;
        });

        console.log('Options Distribution:', counts);
        await sql.close();
    } catch (e) { console.warn(e); }
}
run();
