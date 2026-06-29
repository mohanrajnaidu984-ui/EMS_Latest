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

        let c = { S: 0, C: 0, N: 0, O: 0 };
        options.forEach(o => {
            const cust = o.CustomerName || '';
            if (!cust) c.N++; // Null/Generic
            else if (cust.includes('SEPCO')) c.S++;
            else if (cust.includes('Civil')) c.C++;
            else c.O++;
        });

        console.log(`SEPCO:${c.S} Civil:${c.C} Null:${c.N} Other:${c.O}`);
        await sql.close();
    } catch (e) { console.warn(e); }
}
run();
