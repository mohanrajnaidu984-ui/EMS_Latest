
const sql = require('mssql');
const fs = require('fs');
require('dotenv').config({ path: './.env' });

async function listPricing() {
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

    try {
        await sql.connect(config);

        const res = await sql.query`SELECT TOP 20 RequestNo, OptionID, Price, CustomerName, EnquiryForItem, LeadJobName FROM EnquiryPricingValues ORDER BY UpdatedAt DESC`;
        fs.writeFileSync('pricing_dump.json', JSON.stringify(res.recordset, null, 2));
        console.log('Dumped to pricing_dump.json');

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

listPricing();
