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

async function checkAttachments() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT ID, FileName, Visibility, UploadedBy, Division FROM Attachments WHERE RequestNo = '9'`;
        console.log('Attachments for RequestNo 9:');
        console.table(result.recordset);

        const userResult = await sql.query`SELECT TOP 1 UserName, Roles, DivisionName FROM Users WHERE UserName LIKE '%Electrical%' OR DivisionName LIKE '%Electrical%'`;
        console.log('\nSample Electrical User Info:');
        console.table(userResult.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkAttachments();
