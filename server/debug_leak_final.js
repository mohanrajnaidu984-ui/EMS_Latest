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

async function check() {
    try {
        await sql.connect(config);

        console.log('--- USER DATA ---');
        const users = await sql.query`SELECT FullName, EmailId, Roles, RequestNo FROM Master_ConcernedSE WHERE FullName IN ('Electrical', 'Civil')`;
        console.table(users.recordset);

        if (users.recordset.length > 0) {
            for (const user of users.recordset) {
                if (user.RequestNo) {
                    const div = await sql.query`SELECT ItemName FROM EnquiryFor WHERE RequestNo = ${user.RequestNo}`;
                    console.log(`Division for ${user.FullName}:`, div.recordset[0]?.ItemName);
                }
            }
        }

        console.log('\n--- ATTACHMENTS FOR ENQ 9 ---');
        const attachments = await sql.query`SELECT ID, FileName, Visibility, UploadedBy, Division FROM Attachments WHERE RequestNo = '9'`;
        console.table(attachments.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

check();
