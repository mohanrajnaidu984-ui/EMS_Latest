const sql = require('mssql');
const fs = require('fs');
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
    let output = '';
    const log = (msg) => {
        console.log(msg);
        output += msg + '\n';
    };

    try {
        log('Connecting to: ' + config.server + ' ' + config.database);
        await sql.connect(config);

        const requestNo = '54';

        // Get the quotes
        log(`=== QUOTES FOR ENQUIRY ${requestNo} ===`);
        const quoteResult = await sql.query`
            SELECT ID, QuoteNumber, ToName, PreparedBy, Status, RevisionNo, PreparedByEmail
            FROM EnquiryQuotes 
            WHERE RequestNo = ${requestNo}
        `;
        log(JSON.stringify(quoteResult.recordset, null, 2));

        // Get the hierarchy
        log(`\n=== ENQUIRY ${requestNo} HIERARCHY ===`);
        const hierarchyResult = await sql.query`
            SELECT ID, ParentID, ItemName, LeadJobCode
            FROM EnquiryFor
            WHERE RequestNo = ${requestNo}
            ORDER BY ID
        `;
        log(JSON.stringify(hierarchyResult.recordset, null, 2));

        fs.writeFileSync('debug_54_output.txt', output);
        await sql.close();
    } catch (err) {
        console.error('DEBUG ERROR:', err);
    }
}

debug();
