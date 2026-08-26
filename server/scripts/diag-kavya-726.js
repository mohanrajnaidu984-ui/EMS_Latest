require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');
const { userHasQuotePricingEnquiryAccess, resolvePricingAccessContext } = require('../lib/quotePricingAccess');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 60000,
};

const email = 'alpqs1@almoayyedcg.com';
const requestNo = '726';

(async () => {
    await sql.connect(config);
    const ctx = await resolvePricingAccessContext(email);
    const access = await userHasQuotePricingEnquiryAccess(email, requestNo, 'Landscape Maint');
    console.log('ACCESS_CTX:', {
        userFullName: ctx.userFullName,
        userDepartment: ctx.userDepartment,
        isAdmin: ctx.isAdmin,
        isCcUser: ctx.isCcUser,
    });
    console.log('HAS_ENQUIRY_ACCESS:', access);

    const enq = await sql.query`
        SELECT TOP 1 RequestNo, CustomerName, ConcernedSE, CCMailIds
        FROM Enquiry WHERE LTRIM(RTRIM(CAST(RequestNo AS NVARCHAR(50)))) = ${requestNo}`;
    console.log('ENQUIRY:', enq.recordset[0]);

    const ef = await sql.query`
        SELECT ef.ID, ef.ItemName, ef.ParentID, mef.DepartmentName
        FROM EnquiryFor ef
        LEFT JOIN Master_EnquiryFor mef ON ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName
        WHERE LTRIM(RTRIM(ef.RequestNo)) = ${requestNo}
        ORDER BY ef.ID`;
    console.log('ENQUIRY_FOR_JOBS:', ef.recordset);

    await sql.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
