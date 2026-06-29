const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

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

async function checkEnqFor() {
    try {
        await sql.connect(config);

        console.log('--- ENQUIRYFOR FOR REQ 9 ---');
        const eq9 = await sql.query`SELECT * FROM EnquiryFor WHERE RequestNo = '9'`;
        console.table(eq9.recordset);

        console.log('\n--- ENQUIRYFOR FOR REQ 15 ---');
        const eq15 = await sql.query`SELECT * FROM EnquiryFor WHERE RequestNo = '15'`;
        console.table(eq15.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkEnqFor();
