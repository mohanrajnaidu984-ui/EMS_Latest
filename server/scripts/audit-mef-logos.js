'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sql, connectDB } = require('../dbConfig');
const fs = require('fs');
const path = require('path');

async function main() {
    await connectDB();
    const logos = await sql.query`
        SELECT CompanyName, ItemName, CompanyLogo
        FROM Master_EnquiryFor
        WHERE CompanyLogo IS NOT NULL AND LTRIM(RTRIM(CompanyLogo)) <> ''
    `;
    const dir = path.join(__dirname, '..', 'uploads', 'logos');
    const files = fs.readdirSync(dir);
    let missing = 0;
    let basenameMatch = 0;
    let ok = 0;
    const issues = [];

    for (const r of logos.recordset) {
        const logo = String(r.CompanyLogo).replace(/\\/g, '/');
        const base = path.basename(logo);
        const rel = logo.replace(/^\/?uploads\//, 'uploads/');
        const disk = path.join(__dirname, '..', rel);
        const exists = fs.existsSync(disk);
        if (exists) {
            ok++;
            continue;
        }
        missing++;
        const altByName = files.filter((f) => {
            const fb = f.replace(/^\d+-/, '');
            const bb = base.replace(/^\d+-/, '');
            return fb === bb;
        });
        if (altByName.length) {
            basenameMatch++;
            issues.push({ company: r.CompanyName, item: r.ItemName, db: base, alt: altByName[0] });
        } else {
            issues.push({ company: r.CompanyName, item: r.ItemName, db: base, alt: null });
        }
    }

    console.log({ total: logos.recordset.length, ok, missing, basenameMatch });
    console.log('\nFixable (basename match):');
    console.table(issues.filter((i) => i.alt));
    console.log('\nNo file on disk:');
    console.table(issues.filter((i) => !i.alt));
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
