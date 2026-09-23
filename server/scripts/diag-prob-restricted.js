'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sql, connectDB } = require('../dbConfig');
const { enrichProbabilityListRows } = require('../lib/mapProbabilityListingRows');

const normEmail = (s) =>
    String(s || '')
        .toLowerCase()
        .trim()
        .replace(/@almcg\.com$/i, '@almoayyedcg.com');

async function main() {
    await connectDB();
    const requestNo = String(process.argv[2] || '921').trim();
    const userSearch = String(process.argv[3] || 'Leo Galvez').trim();

    const userRes = await sql.query`
        SELECT TOP 5 ID, FullName, EmailId, Department, Roles
        FROM Master_ConcernedSE
        WHERE FullName LIKE ${'%' + userSearch + '%'}
           OR EmailId LIKE ${'%' + userSearch.replace(/\s+/g, '') + '%'}
    `;
    console.log('\n=== User profile ===');
    console.table(userRes.recordset || []);
    const user = userRes.recordset?.[0];
    if (!user) {
        console.log('User not found');
        process.exit(1);
    }
    const userEmail = normEmail(user.EmailId);

    const ccRes = await sql.query`
        SELECT DISTINCT LTRIM(RTRIM(ISNULL(mef.DepartmentName, ''))) AS DepartmentName
        FROM Master_EnquiryFor mef
        WHERE LTRIM(RTRIM(ISNULL(mef.DepartmentName, ''))) <> ''
          AND (
            ',' + REPLACE(REPLACE(LOWER(ISNULL(mef.CCMailIds, '')), ' ', ''), ';', ',') + ','
              LIKE '%,' + ${userEmail} + ',%'
          )
        ORDER BY DepartmentName
    `;
    console.log('\n=== CC divisions ===');
    console.log((ccRes.recordset || []).map((r) => r.DepartmentName));

    const enqRes = await sql.query`
        SELECT RequestNo, ProjectName, CustomerName
        FROM EnquiryMaster
        WHERE LTRIM(RTRIM(ISNULL(RequestNo, ''))) = ${requestNo}
    `;
    console.log('\n=== Enquiry ===');
    console.table(enqRes.recordset || []);

    const jobsRes = await sql.query`
        SELECT ef.ItemName, mef.DepartmentName, mef.DivisionCode, mef.CommonMailIds, mef.CCMailIds
        FROM EnquiryFor ef
        LEFT JOIN Master_EnquiryFor mef
          ON UPPER(LTRIM(RTRIM(ISNULL(ef.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(mef.ItemName, ''))))
        WHERE LTRIM(RTRIM(ISNULL(ef.RequestNo, ''))) = ${requestNo}
        ORDER BY ef.ItemName
    `;
    console.log('\n=== Enquiry jobs / divisions ===');
    for (const r of jobsRes.recordset || []) {
        console.log({
            ItemName: r.ItemName,
            DepartmentName: r.DepartmentName,
            DivisionCode: r.DivisionCode,
            inCommon: String(r.CommonMailIds || '').toLowerCase().includes(userEmail),
            inCC: String(r.CCMailIds || '').toLowerCase().includes(userEmail),
        });
    }

    const quotesRes = await sql.query`
        SELECT QuoteNumber, ToName, LeadJob, OwnJob, TotalAmount, PreparedBy, PreparedByEmail, QuoteDate, QuoteType, RevisionNo
        FROM EnquiryQuotes
        WHERE LTRIM(RTRIM(ISNULL(RequestNo, ''))) = ${requestNo}
        ORDER BY QuoteDate DESC, RevisionNo DESC
    `;
    console.log('\n=== All quotes for enquiry ===');
    console.table(
        (quotesRes.recordset || []).map((q) => ({
            QuoteNumber: q.QuoteNumber,
            TotalAmount: q.TotalAmount,
            PreparedByEmail: q.PreparedByEmail,
            OwnJob: q.OwnJob,
        }))
    );

    const probRes = await sql.query`
        SELECT OwnJobName, QuoteRef, Status, NetQuotedValue, UpdatedBy, UpdatedDateTime
        FROM dbo.Probability
        WHERE LTRIM(RTRIM(ISNULL(RequestNo, ''))) = ${requestNo}
        ORDER BY UpdatedDateTime DESC
    `;
    console.log('\n=== Probability history ===');
    console.table(probRes.recordset || []);

    const csRes = await sql.query`
        SELECT SEName
        FROM ConcernedSE
        WHERE LTRIM(RTRIM(ISNULL(RequestNo, ''))) = ${requestNo}
    `;
    console.log('\n=== Concerned SE assignments ===');
    console.table(csRes.recordset || []);

    const divisions = [...new Set((jobsRes.recordset || []).map((r) => r.DepartmentName).filter(Boolean))];
    if (!divisions.length) divisions.push(user.Department);

    for (const division of divisions) {
        const row = {
            RequestNo: requestNo,
            ProjectName: enqRes.recordset?.[0]?.ProjectName || '',
            WonQuoteRef: probRes.recordset?.find((p) => p.OwnJobName === division)?.QuoteRef || '',
        };
        const [enriched] = await enrichProbabilityListRows([row], { userEmail, division });
        console.log(`\n=== enrichProbabilityListRows division="${division}" ===`);
        console.log('FilteredQuoteRefs:', enriched?.FilteredQuoteRefs || '(empty)');
        console.log('WonQuoteRef:', row.WonQuoteRef || '(none)');

        const mefRes = await sql.query`
            SELECT ItemName, DepartmentName, DivisionCode, CommonMailIds, CCMailIds
            FROM Master_EnquiryFor
            WHERE UPPER(LTRIM(RTRIM(ISNULL(DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(${division}, ''))))
        `;
        for (const q of quotesRes.recordset || []) {
            let visible = false;
            let reason = '';
            const prep = String(q.PreparedByEmail || '').trim().toUpperCase();
            if (prep && prep === userEmail.toUpperCase()) {
                visible = true;
                reason = 'prepared-by';
            }
            for (const mef of mefRes.recordset || []) {
                const dc = String(mef.DivisionCode || '').trim().toUpperCase();
                const qn = String(q.QuoteNumber || '').toUpperCase();
                const codeMatch =
                    dc &&
                    (qn.includes(`/${dc}/`) || qn.includes(`-${dc}/`) || qn.includes(`/${dc}-`));
                const inCC = `,${String(mef.CCMailIds || '').toLowerCase().replace(/\s+/g, '').replace(/;/g, ',')},`.includes(
                    `,${userEmail},`
                );
                const inCommon = `,${String(mef.CommonMailIds || '').toLowerCase().replace(/\s+/g, '').replace(/;/g, ',')},`.includes(
                    `,${userEmail},`
                );
                if (codeMatch && (inCC || inCommon)) {
                    visible = true;
                    reason = `mef ${mef.ItemName} code=${dc} cc=${inCC} common=${inCommon}`;
                }
            }
            console.log(`  quote ${q.QuoteNumber}: visible=${visible} ${reason ? '(' + reason + ')' : ''}`);
        }
    }

    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
