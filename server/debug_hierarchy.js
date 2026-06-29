const sql = require('mssql');

const config = {
    user: 'bmsuser',
    password: 'bms@acg123',
    server: '151.50.1.116',
    database: 'EMS_DB',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function check() {
    try {
        await sql.connect(config);

        const values = (await sql.query("SELECT OptionID, EnquiryForID, Price, CustomerName FROM EnquiryPricingValues WHERE RequestNo = '51' AND (OptionID = 171 OR OptionID = 162)")).recordset;
        console.log('\n--- VALUES (Opt 171, 162) ---');
        let found = false;
        values.forEach(v => {
            console.log(`O:${v.OptionID} J:${v.EnquiryForID} P:${v.Price} Cust:${v.CustomerName}`);
            found = true;
        });
        if (!found) console.log('No values found for Options 171, 162');

        await sql.close();
    } catch (e) {
        console.error(e);
    }
}
check();
