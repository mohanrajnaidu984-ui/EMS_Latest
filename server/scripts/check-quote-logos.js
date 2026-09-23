'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sql, connectDB } = require('../dbConfig');
const fs = require('fs');
const path = require('path');

async function main() {
    await connectDB();
    const requestNo = process.argv[2] || '441';

    const enq = await sql.query`
        SELECT RequestNo, ProjectName, CustomerName FROM EnquiryMaster WHERE LTRIM(RTRIM(RequestNo)) = ${requestNo}
    `;
    console.log('Enquiry:', enq.recordset);

    const jobs = await sql.query`
        SELECT ef.ItemName, mef.DepartmentName, mef.CompanyName, mef.CompanyLogo
        FROM EnquiryFor ef
        LEFT JOIN Master_EnquiryFor mef
          ON UPPER(LTRIM(RTRIM(ISNULL(ef.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(mef.ItemName, ''))))
        WHERE LTRIM(RTRIM(ISNULL(ef.RequestNo, ''))) = ${requestNo}
    `;
    console.log('\nJobs / MEF branding:');
    for (const r of jobs.recordset || []) {
        console.log({
            ItemName: r.ItemName,
            DepartmentName: r.DepartmentName,
            CompanyName: r.CompanyName,
            CompanyLogo: r.CompanyLogo,
        });
    }

    const camair = await sql.query`
        SELECT TOP 10 ItemName, DepartmentName, CompanyName, CompanyLogo
        FROM Master_EnquiryFor
        WHERE CompanyName LIKE '%Cam%' OR ItemName LIKE '%Cam%' OR DepartmentName LIKE '%Direct%'
        ORDER BY ItemName
    `;
    console.log('\nCamAir / Direct Sales MEF rows:');
    console.table(camair.recordset);

    const logos = await sql.query`
        SELECT CompanyName, ItemName, DepartmentName, CompanyLogo
        FROM Master_EnquiryFor
        WHERE CompanyLogo IS NOT NULL AND LTRIM(RTRIM(CompanyLogo)) <> ''
        ORDER BY CompanyName
    `;
    console.log('\nSample logo path formats:');
    for (const r of (logos.recordset || []).slice(0, 15)) {
        const logo = String(r.CompanyLogo || '').replace(/\\/g, '/');
        let exists = 'n/a';
        const idx = logo.toLowerCase().indexOf('/uploads/');
        if (idx >= 0) {
            const rel = logo.slice(idx);
            const disk = path.join(__dirname, '..', rel.replace(/^\//, ''));
            exists = fs.existsSync(disk);
        }
        console.log({ company: r.CompanyName, logo: logo.slice(0, 80), fileExists: exists });
    }

    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
