
const sql = require('mssql');
require('dotenv').config({ path: './.env' });

async function listEnquiries() {
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

    try {
        await sql.connect(config);

        console.log('--- Recent Enquiries ---');
        const enqs = await sql.query`SELECT TOP 10 RequestNo, ProjectName, CustomerName FROM EnquiryMaster ORDER BY CAST(RequestNo AS INT) DESC`;
        console.table(enqs.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

listEnquiries();
