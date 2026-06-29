const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function debugPricing() {
    try {
        await sql.connect(dbConfig);

        console.log('Connected to DB');

        const requestNo = '53';
        console.log(`\nChecking RequestNo: ${requestNo}`);

        // Get columns first to avoid guessing
        const columns = await sql.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryPricingOptions'
        `);
        console.log('Columns:', columns.recordset.map(c => c.COLUMN_NAME).join(', '));

        const result = await sql.query(`
            SELECT *
            FROM EnquiryPricingOptions po
            WHERE po.RequestNo = '${requestNo}'
        `);

        console.log('\n--- Options ---');
        result.recordset.forEach(o => {
            console.log(`[${o.ID}] Customer: ${o.CustomerName} | Job: ${o.ItemName} | Option: ${o.OptionName || o.Name}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

debugPricing();
