const sql = require('mssql');
require('dotenv').config();

async function checkUserAccess() {
    try {
        await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: { encrypt: false, trustServerCertificate: true }
        });

        // Check what jobs are in EnquiryFor for Enquiry 43
        const res = await sql.query`
            SELECT ID, ItemName, ParentID 
            FROM EnquiryFor 
            WHERE RequestNo = '43'
            ORDER BY ParentID, ID
        `;
        console.log('=== Jobs for Enquiry 43 ===');
        res.recordset.forEach(r => {
            console.log(`ID: ${r.ID} | Name: ${r.ItemName} | ParentID: ${r.ParentID || 'NULL (Root)'}`);
        });

        // Check email assignments
        console.log('\n=== Email Assignments ===');
        const res2 = await sql.query`
            SELECT ItemName, CommonMailIds, CCMailIds 
            FROM EnquiryFor 
            WHERE RequestNo = '43'
        `;
        res2.recordset.forEach(r => {
            console.log(`Job: ${r.ItemName}`);
            console.log(`  Common: ${r.CommonMailIds || 'None'}`);
            console.log(`  CC: ${r.CCMailIds || 'None'}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        sql.close();
    }
}

checkUserAccess();
