const sql = require('mssql');

const dbConfig = {
    user: 'bmsuser',
    password: 'bms@acg123',
    server: '151.50.1.116',
    database: 'EMS_DB',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function check() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT ID, FileName, Visibility, UploadedBy, Division FROM Attachments WHERE (UploadedBy IN ('Electrical', 'Civil') OR Division IN ('Electrical', 'Civil')) AND RequestNo = '9'`;
        console.log('Attachments for Enq 9:');
        console.table(result.recordset);

        const userResult = await sql.query`SELECT UserName, Roles, DivisionName, FullName FROM Users WHERE UserName IN ('Electrical', 'Civil', 'civil', 'electrical')`;
        console.log('\nUsers:');
        console.table(userResult.recordset);

        // Also check Master_ConcernedSE since login uses it
        const seResult = await sql.query`SELECT FullName, EmailId, Roles, RequestNo FROM Master_ConcernedSE WHERE FullName IN ('Electrical', 'Civil', 'civil', 'electrical')`;
        console.log('\nConcerned SEs:');
        console.table(seResult.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

check();
