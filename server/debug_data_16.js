const sql = require('mssql');

async function run() {
    try {
        const { dbConfig: config } = require('./dbConfig');
        await sql.connect(config);
        const req = '16';

        const ef = await sql.query`SELECT ID, ItemName, ParentID FROM EnquiryFor WHERE RequestNo = ${req}`;
        const opts = await sql.query`SELECT ID, OptionName, ItemName, CustomerName FROM EnquiryPricingOptions WHERE RequestNo = ${req}`;

        const fs = require('fs');
        let out = '';
        out += '--- ENQUIRY FOR ---\n';
        out += JSON.stringify(ef.recordset, null, 2);
        out += '\n\n--- PRICING OPTIONS ---\n';
        out += JSON.stringify(opts.recordset, null, 2);

        fs.writeFileSync('debug_16_out.txt', out);
        console.log('DEBUG COMPLETE');

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
