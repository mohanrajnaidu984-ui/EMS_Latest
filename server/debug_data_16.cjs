const sql = require('mssql');
const { dbConfig } = require('./dbConfig');
const fs = require('fs');

async function checkData() {
    try {
        await sql.connect(dbConfig);
        let log = '';

        const jobs = await sql.query(`
            SELECT ID, ItemName, ParentID FROM EnquiryFor WHERE RequestNo = 16
        `);
        log += '\n--- EnquiryFor (Jobs) for Req 16 ---\n';
        log += JSON.stringify(jobs.recordset, null, 2);

        const options = await sql.query(`
            SELECT ID, OptionName, ItemName, CustomerName, LeadJobName FROM EnquiryPricingOptions WHERE RequestNo = 16
        `);
        log += '\n--- EnquiryPricingOptions for Req 16 ---\n';
        log += JSON.stringify(options.recordset, null, 2);

        fs.writeFileSync('server/output_data_16.txt', log);
        console.log('Output written to server/output_data_16.txt');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkData();
