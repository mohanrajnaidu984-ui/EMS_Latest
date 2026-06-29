const sql = require('mssql');
require('dotenv').config();

async function checkEnquiry() {
    try {
        await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: { encrypt: false, trustServerCertificate: true }
        });

        const res = await sql.query`
            SELECT RequestNo, ProjectName 
            FROM EnquiryMaster 
            WHERE RequestNo LIKE '%43%'
        `;
        console.log('Enquiries:', JSON.stringify(res.recordset, null, 2));

        if (res.recordset.length > 0) {
            const reqNo = res.recordset[0].RequestNo;
            const res2 = await sql.query`
                SELECT ID, ParentID, ItemName 
                FROM EnquiryFor 
                WHERE RequestNo = ${reqNo}
            `;
            console.log(`Hierarchy for ${reqNo}:`, JSON.stringify(res2.recordset, null, 2));
        }
    } catch (err) {
        console.error(err);
    } finally {
        sql.close();
    }
}

checkEnquiry();
