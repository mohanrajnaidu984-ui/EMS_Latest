const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function debugPricing() {
    try {
        await sql.connect(dbConfig);

        console.log('Connected to DB');

        const requestNo = '53';
        console.log(`\nChecking RequestNo: ${requestNo}`);

        const result = await sql.query(`
            SELECT 
                po.ID, po.RequestNo, po.Name, po.ItemName, po.CustomerName
            FROM EnquiryPricingOptions po
            WHERE po.RequestNo = '${requestNo}'
        `);

        console.log('\n--- Options ---');
        result.recordset.forEach(o => {
            console.log(`[${o.ID}] Customer: ${o.CustomerName} | Job: ${o.ItemName} | Option: ${o.Name}`);
        });

        const jobs = await sql.query(`
            SELECT ID, RequestNo, ItemName, ParentID
            FROM EnquiryFor
            WHERE RequestNo = '${requestNo}'
        `);
        console.log('\n--- Jobs ---');
        console.table(jobs.recordset);


    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

debugPricing();
