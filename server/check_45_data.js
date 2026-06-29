const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: { encrypt: false, trustServerCertificate: true }
};

sql.connect(config).then(async () => {
    const res = await sql.query(`SELECT RequestNo, ProjectName, CustomerName, ClientName, ConsultantName FROM EnquiryMaster WHERE RequestNo = '45'`);
    console.log('Enquiry 45 Data:', JSON.stringify(res.recordset[0], null, 2));

    const jobs = await sql.query(`SELECT RequestNo, ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = '45'`);
    console.log('Enquiry 45 Jobs:', jobs.recordset.length);

    const prices = await sql.query(`SELECT RequestNo, Price FROM EnquiryPricingValues WHERE RequestNo = '45'`);
    console.log('Enquiry 45 Prices:', prices.recordset.length);

    process.exit(0);
});
