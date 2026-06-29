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

        console.log('--- PRICING VALUES FOR ENQUIRY 16 ---');
        const prices = await sql.query`
            SELECT PV.EnquiryForID, PV.EnquiryForItem, PV.Price, PO.CustomerName, PO.OptionName
            FROM EnquiryPricingValues PV
            JOIN EnquiryPricingOptions PO ON PV.OptionID = PO.ID
            WHERE PV.RequestNo = '16'
        `;
        prices.recordset.forEach(p => {
            console.log(`JobID:${p.EnquiryForID} | Item:${p.EnquiryForItem} | Price:${p.Price} | Cust:${p.CustomerName} | Opt:${p.OptionName}`);
        });

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

check();
