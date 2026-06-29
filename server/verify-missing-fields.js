const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function verifyMissingFields() {
    try {
        await sql.connect(config);

        // Fetch the specific enquiry from the screenshot or the latest one
        const result = await sql.query`SELECT TOP 1 
            RequestNo, 
            EnquiryDate, 
            DueDate, 
            SiteVisitDate, 
            HardCopies, 
            Drawing, 
            CD_DVD, 
            Spec, 
            EquipmentSchedule 
        FROM Enquiries 
        ORDER BY CreatedAt DESC`;

        if (result.recordset.length > 0) {
            const enq = result.recordset[0];
            console.log('Enquiry Data:', enq);
            console.log('EnquiryDate Type:', typeof enq.EnquiryDate);
            console.log('HardCopies Type:', typeof enq.HardCopies);
        } else {
            console.log('No enquiries found.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

verifyMissingFields();
