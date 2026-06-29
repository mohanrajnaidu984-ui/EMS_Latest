
const sql = require('mssql');
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

        console.log('--- Top 10 Pricing Values ---');
        const res = await sql.query`SELECT TOP 10 RequestNo, OptionID, Price, CustomerName, EnquiryForItem, LeadJobName FROM EnquiryPricingValues ORDER BY UpdatedAt DESC`;
        console.table(res.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

listPricing();
