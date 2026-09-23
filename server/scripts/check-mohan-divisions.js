require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');

(async () => {
    await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE,
        options: { encrypt: false, trustServerCertificate: true },
    });
    const email = 'mohan.naidu@almoayyedcg.com';
    const u = await sql.query`
        SELECT FullName, Roles, Department, EmailId, Status
        FROM Master_ConcernedSE
        WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) =
              LOWER(LTRIM(RTRIM(${email})))
    `;
    console.log('User:', u.recordset);

    const cc = await sql.query`
        SELECT DISTINCT LTRIM(RTRIM(ISNULL(DepartmentName, N''))) AS DepartmentName
        FROM Master_EnquiryFor
        WHERE LTRIM(RTRIM(ISNULL(DepartmentName, N''))) <> N''
          AND (
            N',' + REPLACE(REPLACE(LOWER(ISNULL(CCMailIds, N'')), N' ', N''), N';', N',') + N','
              LIKE ${'%,' + email.toLowerCase() + ',%'}
            OR N',' + REPLACE(REPLACE(LOWER(ISNULL(CCMailIds, N'')), N' ', N''), N';', N',') + N','
              LIKE ${'%,mohan.naidu,%'}
          )
    `;
    console.log('CC divisions:', cc.recordset);

    const depts = await sql.query`
        SELECT DISTINCT LTRIM(RTRIM(ISNULL(Department, N''))) AS Department
        FROM Master_ConcernedSE
        WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) =
              LOWER(LTRIM(RTRIM(${email})))
          AND LTRIM(RTRIM(ISNULL(Department, N''))) <> N''
    `;
    console.log('Profile departments:', depts.recordset);

    await sql.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
