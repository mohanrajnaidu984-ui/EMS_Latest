const sql = require('mssql');
require('dotenv').config();

async function checkHierarchy() {
    try {
        await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: { encrypt: false, trustServerCertificate: true }
        });

        const res = await sql.query`
            SELECT ID, ParentID, ItemName 
            FROM EnquiryFor 
            WHERE RequestNo = '43'
        `;
        console.log('Hierarchy for Enquiry 43:');
        console.table(res.recordset);
    } catch (err) {
        console.error(err);
    } finally {
        sql.close();
    }
}

checkHierarchy();
