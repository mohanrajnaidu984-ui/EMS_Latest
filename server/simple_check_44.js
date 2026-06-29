const sql = require('mssql');
require('dotenv').config();

async function simpleCheck() {
    try {
        await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: { encrypt: false, trustServerCertificate: true }
        });

        // Check EnquiryCustomer
        const result = await sql.query`
            SELECT COUNT(*) as count
            FROM EnquiryCustomer 
            WHERE RequestNo = '44'
        `;

        console.log('EnquiryCustomer records for Enquiry 44:', result.recordset[0].count);

        if (result.recordset[0].count > 0) {
            const data = await sql.query`SELECT TOP 5 * FROM EnquiryCustomer WHERE RequestNo = '44'`;
            console.log('\nSample data:', JSON.stringify(data.recordset, null, 2));
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        sql.close();
    }
}

simpleCheck();
