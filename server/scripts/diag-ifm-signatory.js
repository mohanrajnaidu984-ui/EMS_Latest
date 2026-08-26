/**
 * Diagnose signatory options for IFM Elec Maint division.
 */
require('dotenv').config();
const sql = require('mssql');
const { fetchQuoteDivisionUserOptions } = require('../lib/quoteDivisionUserOptions');
const { parseMailCsv } = require('../lib/enquiryOutlookEmailFields');
const { normalizeUserEmail } = require('../lib/digitalSignaturesJson');

async function main() {
    await sql.connect({
        user: process.env.DB_USER,
        password: String(process.env.DB_PASSWORD || '').replace(/^"|"$/g, ''),
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE,
        options: { encrypt: false, trustServerCertificate: true },
    });

    const div = 'IFM Elec Maint';
    const mef = await sql.query`
        SELECT ItemName, DepartmentName, CCMailIds
        FROM Master_EnquiryFor
        WHERE LTRIM(RTRIM(ISNULL(DepartmentName, N''))) = ${div}
           OR LTRIM(RTRIM(ISNULL(ItemName, N''))) = ${div}
           OR ItemName LIKE ${'%' + div + '%'}
           OR DepartmentName LIKE ${'%' + div + '%'}
    `;
    console.log('MEF rows:', JSON.stringify(mef.recordset, null, 2));

    const ccEmails = new Set();
    for (const row of mef.recordset || []) {
        for (const em of parseMailCsv(row.CCMailIds)) {
            ccEmails.add(normalizeUserEmail(em));
        }
    }
    console.log('\nCC emails parsed:', [...ccEmails]);

    const users2 = await sql.query`
        SELECT FullName, EmailId, Department, Status
        FROM Master_ConcernedSE
        WHERE FullName LIKE N'%Y Amit%'
           OR FullName LIKE N'%Sharma%'
           OR EmailId LIKE N'%amit.sharma%'
    `;
    console.log('\nUsers Y Amit / Sharma / amit.sharma email:', JSON.stringify(users2.recordset, null, 2));

    const amitSharmaUser = await sql.query`
        SELECT TOP 1 FullName, EmailId FROM Master_ConcernedSE
        WHERE LOWER(LTRIM(RTRIM(EmailId))) = N'amit.sharma@almoayyedcg.com'
    `;
    console.log('\nUser with amit.sharma email:', JSON.stringify(amitSharmaUser.recordset, null, 2));

    const opts = await fetchQuoteDivisionUserOptions(div);
    console.log('\nSignatory options:', opts.signatoryOptions.map((o) => `${o.label} <${o.email}>`));
    console.log('Prepared By options:', opts.preparedByOptions.map((o) => `${o.label} <${o.email}>`));

    await sql.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
