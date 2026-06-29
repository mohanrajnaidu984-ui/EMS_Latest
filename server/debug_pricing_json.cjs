const sql = require('mssql');
const { dbConfig } = require('./dbConfig');
const fs = require('fs');
const path = require('path');

async function listPricing() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected to DB');
        const requestNo = '53';
        const result = await sql.query(`
            SELECT ID, RequestNo, OptionName, ItemName, CustomerName
            FROM EnquiryPricingOptions 
            WHERE RequestNo = '${requestNo}'
            ORDER BY CustomerName, ItemName, OptionName
        `);

        console.log(`Found ${result.recordset.length} options.`);

        fs.writeFileSync(path.join(__dirname, 'pricing_53.json'), JSON.stringify(result.recordset, null, 2));
        console.log('Wrote to pricing_53.json');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

listPricing();
