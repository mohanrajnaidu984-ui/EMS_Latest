const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

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

async function checkEnquiry45() {
    try {
        await sql.connect(config);
        console.log('--- ENQUIRY 45 DATA ---');

        const enq = await sql.query("SELECT RequestNo, ProjectName, CustomerName, Status FROM EnquiryMaster WHERE RequestNo = '45'");
        console.log('EnquiryMaster:', JSON.stringify(enq.recordset, null, 2));

        const pricing = await sql.query(`
            SELECT PO.RequestNo, PO.CustomerName, PO.ItemName, PV.Price 
            FROM EnquiryPricingOptions PO 
            JOIN EnquiryPricingValues PV ON PO.ID = PV.OptionID 
            WHERE PO.RequestNo = '45'
        `);
        console.log('Pricing:', JSON.stringify(pricing.recordset, null, 2));

        const enquiryFor = await sql.query("SELECT * FROM EnquiryFor WHERE RequestNo = '45'");
        console.log('EnquiryFor:', JSON.stringify(enquiryFor.recordset, null, 2));

        const masterEnq = await sql.query("SELECT * FROM Master_EnquiryFor WHERE ItemName LIKE '%Electrical%' OR DivisionCode = 'ELE'");
        console.log('Master_EnquiryFor:', JSON.stringify(masterEnq.recordset, null, 2));

        const quotes = await sql.query("SELECT * FROM EnquiryQuotes WHERE RequestNo = '45'");
        console.log('EnquiryQuotes:', JSON.stringify(quotes.recordset, null, 2));

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

checkEnquiry45();
