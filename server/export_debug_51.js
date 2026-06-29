const sql = require('mssql');
const fs = require('fs');

const config = {
    user: 'bmsuser',
    password: 'bms@acg123',
    server: '151.50.1.116',
    database: 'EMS_DB',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        await sql.connect(config);
        const data = {};

        // 1. Enquiry 51 details
        data.enquiry = (await sql.query("SELECT * FROM EnquiryMaster WHERE RequestNo = '51'")).recordset[0];

        // 2. Jobs
        data.jobs = (await sql.query("SELECT * FROM EnquiryFor WHERE RequestNo = '51'")).recordset;

        // 3. Pricing Options
        data.options = (await sql.query("SELECT * FROM EnquiryPricingOptions WHERE RequestNo = '51'")).recordset;

        // 4. Pricing Values
        data.values = (await sql.query("SELECT * FROM EnquiryPricingValues WHERE RequestNo = '51'")).recordset;

        // 5. Division info
        data.divisions = (await sql.query("SELECT * FROM Master_EnquiryFor")).recordset;

        fs.writeFileSync('debug_data_51.json', JSON.stringify(data, null, 2));
        console.log('Data saved to debug_data_51.json');

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}
run();
