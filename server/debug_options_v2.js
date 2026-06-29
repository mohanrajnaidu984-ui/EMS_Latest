const sql = require('mssql');
require('dotenv').config();

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

async function checkPricing() {
    try {
        await sql.connect(config);
        console.log('Connected to DB');

        const requestNo = 16;

        console.log('\n--- EnquiryPricingOptions with "Option 1" (space) ---');
        const optionsSpace = await sql.query`SELECT * FROM EnquiryPricingOptions WHERE RequestNo = ${requestNo} AND OptionName = 'Option 1'`;
        console.log(JSON.stringify(optionsSpace.recordset, null, 2));

        console.log('\n--- EnquiryPricingOptions with "Option-1" (hyphen) ---');
        const optionsHyphen = await sql.query`SELECT * FROM EnquiryPricingOptions WHERE RequestNo = ${requestNo} AND OptionName = 'Option-1'`;
        console.log(JSON.stringify(optionsHyphen.recordset, null, 2));

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

checkPricing();
