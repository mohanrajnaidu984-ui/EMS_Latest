const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function debug() {
    try {
        await sql.connect(config);

        // Get the BMS quote details
        console.log('=== BMS QUOTE FOR ENQUIRY 51 ===');
        const quoteResult = await sql.query`
            SELECT ID, QuoteNumber, ToName, PreparedBy, PreparedByEmail, Status, RevisionNo 
            FROM EnquiryQuotes 
            WHERE RequestNo = '51'
        `;
        console.log('Quote Details:');
        console.table(quoteResult.recordset);

        // Get the hierarchy
        console.log('\n=== ENQUIRY 51 HIERARCHY ===');
        const hierarchyResult = await sql.query`
            SELECT ID, ParentID, ItemName, LeadJobCode
            FROM EnquiryFor
            WHERE RequestNo = '51'
            ORDER BY ID
        `;
        console.log('Hierarchy:');
        console.table(hierarchyResult.recordset);

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

debug();
