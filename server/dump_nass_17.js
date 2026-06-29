const sql = require('mssql');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

async function checkAllNassOptions() {
    try {
        await sql.connect(config);
        const result = await sql.query`
            SELECT o.*, v.Price 
            FROM EnquiryPricingOptions o
            LEFT JOIN EnquiryPricingValues v ON o.ID = v.OptionID
            WHERE o.RequestNo = 17 
              AND (o.CustomerName = 'Nass Contracting')
        `;
        fs.writeFileSync('nass_dump_17.json', JSON.stringify(result.recordset, null, 2), 'utf8');
        console.log('Results written to nass_dump_17.json');
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkAllNassOptions();
