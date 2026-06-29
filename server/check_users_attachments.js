const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function checkUsers() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT UserName, Roles, DivisionName FROM Users WHERE UserName IN ('Electrical', 'Civil')`;
        console.log('User Details:');
        console.table(result.recordset);

        const attachResult = await sql.query`SELECT ID, FileName, Visibility, UploadedBy, Division FROM Attachments WHERE (UploadedBy IN ('Electrical', 'Civil') OR Division IN ('Electrical', 'Civil')) AND RequestNo = '9'`;
        console.log('\nAttachments for Enq 9:');
        console.table(attachResult.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkUsers();
