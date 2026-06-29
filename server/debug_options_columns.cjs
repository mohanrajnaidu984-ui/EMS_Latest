const sql = require('mssql');
const { dbConfig } = require('./dbConfig');
const fs = require('fs');

async function checkColumns() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryPricingOptions'
        `);

        let log = '';
        log += '\n--- EnquiryPricingOptions Columns ---\n';
        result.recordset.forEach(row => log += row.COLUMN_NAME + '\n');

        const data = await sql.query(`
            SELECT TOP 10 * FROM EnquiryPricingOptions WHERE RequestNo = 16
        `);
        log += '\n--- EnquiryPricingOptions Sample Data (Req 16) ---\n';
        log += JSON.stringify(data.recordset, null, 2);

        fs.writeFileSync('server/output_debug.txt', log);
        console.log('Output written to server/output_debug.txt');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkColumns();
