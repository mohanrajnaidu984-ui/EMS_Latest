const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

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

async function inspect() {
    try {
        await sql.connect(config);

        const requestNo = '107';
        const customerName = 'Genpact';
        console.log(`Inspecting Pricing Options for Request ${requestNo}, Customer ${customerName}...`);

        const options = await sql.query`
            SELECT ID, OptionName, ItemName, CustomerName 
            FROM EnquiryPricingOptions 
            WHERE RequestNo = ${requestNo} AND CustomerName = ${customerName}
        `;
        console.table(options.recordset);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

inspect();
