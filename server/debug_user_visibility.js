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
        trustServerCertificate: true,
        enableArithAbort: true,
    }
};

const userEmail = 'bmsselvery1@almoayyedcg.com';

(async () => {
    try {
        await sql.connect(config);
        console.log('Connected to DB');

        // 1. Check user in Master_ConcernedSE
        const userRes = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${userEmail}`;
        console.log('\n--- User in Master_ConcernedSE ---');
        console.log(userRes.recordset);

        if (userRes.recordset.length === 0) {
            console.log('User NOT FOUND in Master_ConcernedSE');
        } else {
            const fullName = userRes.recordset[0].FullName;
            console.log('Full Name:', fullName);

            // 2. Check assignments in ConcernedSE
            const assignedRes = await sql.query`SELECT * FROM ConcernedSE WHERE SEName = ${fullName}`;
            console.log('\n--- Assignments in ConcernedSE ---');
            console.log('Count:', assignedRes.recordset.length);
            console.log(assignedRes.recordset.slice(0, 5)); // Show first 5

            // 3. Check visibility context logic like index.js
            const email = userEmail.toLowerCase();
            const [uRes, ccRes] = await Promise.all([
                sql.query`
                    SELECT TOP 1 FullName
                    FROM Master_ConcernedSE
                    WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) = ${email}
                `,
                sql.query`
                    SELECT TOP 1 1 AS ok
                    FROM Master_EnquiryFor
                    WHERE ',' + REPLACE(REPLACE(ISNULL(CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${`%,${email},%`}
                `
            ]);
            
            console.log('\n--- Visibility Context Mock ---');
            console.log('FullName from Query:', uRes.recordset?.[0]?.FullName);
            console.log('isCcUser:', (ccRes.recordset?.length || 0) > 0);

            // 4. Total enquiries count
            const totalEnq = await sql.query`SELECT COUNT(*) as count FROM EnquiryMaster`;
            console.log('\nTotal Enquiries in EnquiryMaster:', totalEnq.recordset[0].count);
        }

        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
})();
