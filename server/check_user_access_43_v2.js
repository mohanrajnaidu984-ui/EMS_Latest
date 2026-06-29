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
            SELECT * 
            FROM EnquiryFor 
            WHERE RequestNo = '43'
        `;
        console.log('=== Jobs for Enquiry 43 ===');
        if (res.recordset.length > 0) {
            console.log('Columns:', Object.keys(res.recordset[0]));
            res.recordset.forEach(r => {
                console.log(`\nID: ${r.ID} | Name: ${r.ItemName}`);
                console.log(`  Common: ${r.CommonMailIds || 'None'}`);
                console.log(`  CC: ${r.CCMailIds || 'None'}`);
            });
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        sql.close();
    }
}

checkUserAccess();
