const sql = require('mssql');
require('dotenv').config();

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

async function debug() {
    try {
        await sql.connect(config);
        const requestNo = '16';

        const fs = require('fs');
        const jobs = await sql.query(`SELECT ID, ParentID, ItemName, LeadJobCode FROM EnquiryFor WHERE RequestNo = '${requestNo}'`);
        const options = await sql.query(`SELECT ID, OptionName, ItemName, CustomerName, LeadJobName FROM EnquiryPricingOptions WHERE RequestNo = '${requestNo}'`);
        const values = await sql.query(`SELECT OptionID, EnquiryForID, EnquiryForItem, Price, UpdatedAt FROM EnquiryPricingValues WHERE RequestNo = '${requestNo}'`);

        const output = {
            jobs: jobs.recordset,
            options: options.recordset,
            values: values.recordset
        };
        fs.writeFileSync('debug_16_list_out.json', JSON.stringify(output, null, 2));
        console.log('Results written to debug_16_list_out.json');

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

debug();
