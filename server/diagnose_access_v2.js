require('dotenv').config();
const { dbConfig } = require('./dbConfig');
const sql = require('mssql');

async function diagnoseAccess() {
    try {
        await sql.connect(dbConfig);

        const requestNo = '12';
        const userEmail = 'lakshman.naidu@almoayyedcg.com';

        console.log(`Diagnosing Access for Request ${requestNo}, User: ${userEmail}`);

        // 1. Check Enquiry
        const enq = await sql.query`SELECT CreatedBy, ProjectName FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
        if (enq.recordset.length === 0) {
            console.log('Enquiry not found');
            return;
        }
        console.log('Enquiry:', JSON.stringify(enq.recordset[0]));
        const creator = enq.recordset[0].CreatedBy;

        // 2. Check User 
        const userRes = await sql.query`SELECT FullName, Roles FROM Master_ConcernedSE WHERE EmailId = ${userEmail}`;
        const user = userRes.recordset[0];
        console.log('User:', JSON.stringify(user));

        if (!user) { console.log("User not found in DB"); return; }

        // 3. Check Concerned SE
        const cse = await sql.query`SELECT * FROM ConcernedSE WHERE RequestNo = ${requestNo} AND SEName = ${user.FullName}`;
        console.log('Is Concerned SE?', cse.recordset.length > 0);

        // 4. Check Jobs & Emails
        const jobs = await sql.query`
            SELECT EF.ItemName, MEF.CommonMailIds, MEF.CCMailIds 
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo = ${requestNo}
        `;

        console.log('Jobs & Assignments:');
        jobs.recordset.forEach(j => {
            const common = (j.CommonMailIds || '').toLowerCase();
            const cc = (j.CCMailIds || '').toLowerCase();
            const match = common.includes(userEmail.toLowerCase()) || cc.includes(userEmail.toLowerCase());
            console.log(` - ${j.ItemName}: [${match ? 'MATCH' : 'No'}]`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        sql.close();
    }
}

diagnoseAccess();
