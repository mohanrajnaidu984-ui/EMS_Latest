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

        console.log('--- BMS Option-1 PRICES FOR ENQUIRY 16 ---');
        const prices = await sql.query`
            SELECT PV.EnquiryForItem, PV.Price, PO.OptionName, PO.CustomerName, PO.LeadJobName, PO.ID as OptID
            FROM EnquiryPricingValues PV
            JOIN EnquiryPricingOptions PO ON PV.OptionID = PO.ID
            WHERE PV.RequestNo = '16' AND PV.EnquiryForItem = 'BMS' AND PO.OptionName = 'Option-1'
        `;
        prices.recordset.forEach(p => {
            console.log(`Cust:${String(p.CustomerName).padEnd(20)} | Lead:${String(p.LeadJobName).padEnd(20)} | Price:${p.Price} | ID:${p.OptID}`);
        });

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

check();
