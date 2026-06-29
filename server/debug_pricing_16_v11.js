const sql = require('mssql');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function check() {
    try {
        await sql.connect(config);
        const prices = await sql.query`
            SELECT PO.CustomerName, PO.LeadJobName, PV.Price, PO.ID
            FROM EnquiryPricingValues PV
            JOIN EnquiryPricingOptions PO ON PV.OptionID = PO.ID
            WHERE PV.RequestNo = '16' AND PV.EnquiryForItem = 'BMS' AND PO.OptionName = 'Option-1'
        `;
        process.stdout.write(JSON.stringify(prices.recordset, null, 2));
        await sql.close();
    } catch (err) {
        console.error(err);
    }
}
check();
