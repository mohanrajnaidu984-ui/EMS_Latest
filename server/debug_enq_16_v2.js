const sql = require('mssql');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

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

async function check() {
    try {
        await sql.connect(config);
        const result = await sql.query`
            SELECT ID, QuoteNumber, ToName, RequestNo, RevisionNo, Status 
            FROM EnquiryQuotes 
            WHERE RequestNo = '16'
        `;
        console.log('--- QUOTES ---');
        result.recordset.forEach(q => {
            console.log(`ID:${q.ID} | Q#:${q.QuoteNumber} | To:${q.ToName} | Rev:${q.RevisionNo}`);
        });

        const jobs = await sql.query`
            SELECT ID, ItemName, ParentID, LeadJobCode
            FROM EnquiryFor
            WHERE RequestNo = '16'
        `;
        console.log('--- JOBS ---');
        jobs.recordset.forEach(j => {
            console.log(`ID:${j.ID} | Name:${j.ItemName} | Parent:${j.ParentID} | Code:${j.LeadJobCode}`);
        });

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

check();
