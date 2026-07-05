require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');
const {
    buildConcernedSEAssignmentsFromEnquiryFor,
} = require('../lib/concernedSeAssignments.cjs');

const APPLY = process.argv.includes('--apply');
const REQUEST_NO = (() => {
    const i = process.argv.indexOf('--request-no');
    return i >= 0 ? String(process.argv[i + 1] || '').trim() : '';
})();

function norm(s) {
    return String(s || '').trim().toLowerCase();
}

function stripLeadPrefix(name) {
    return String(name || '')
        .replace(/^L\d+(-L\d+)*\s*-\s*/i, '')
        .trim();
}

function divisionKeys(itemName) {
    const raw = String(itemName || '').trim();
    const stripped = stripLeadPrefix(raw);
    const keys = new Set([norm(raw), norm(stripped)]);
    const parts = stripped.split(' - ').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) keys.add(norm(parts[parts.length - 1]));
    return [...keys].filter(Boolean);
}

function userMatchesDivision(userDept, itemName, mefDept) {
    const d = norm(userDept);
    if (!d) return false;
    const keys = divisionKeys(itemName);
    if (mefDept) keys.push(norm(mefDept));
    return keys.some((k) => d === k);
}

function inferAssigneesForDivision(item, seNames, users, mefByItem) {
    const mef = mefByItem.get(norm(item.ItemName)) || mefByItem.get(norm(stripLeadPrefix(item.ItemName)));
    const mefDept = mef?.DepartmentName || '';
    const selected = new Set(seNames.map(norm));
    const matched = users
        .filter((u) => selected.has(norm(u.FullName)))
        .filter((u) => userMatchesDivision(u.Department, item.ItemName, mefDept))
        .map((u) => String(u.FullName).trim());
    if (matched.length > 0) return [...new Set(matched)];

    // Single division + single SE on enquiry — safe fallback
    if (seNames.length === 1) return [seNames[0]];
    return [];
}

function findAccountableForDivision(item, assignees, concernedRows) {
    if (assignees.length === 1) return assignees[0];

    const division = String(item.ItemName || '').trim();
    const yesRows = concernedRows.filter((r) => {
        const acc = norm(r.accountability || r.Accountability);
        if (acc !== 'yes') return false;
        const name = String(r.SEName || '').trim();
        if (!assignees.includes(name)) return false;
        const own = String(r.ownjob || r.OwnJob || '').trim();
        if (own && division && norm(own) === norm(division)) return true;
        if (!own) return true;
        return false;
    });

    if (yesRows.length === 1) return String(yesRows[0].SEName).trim();
    if (yesRows.length > 1) return null;
    return null;
}

function buildSyntheticEnquiryFor(structure, seNames, users, mefByItem, concernedRows) {
    return structure.map((item) => {
        const assignees = inferAssigneesForDivision(item, seNames, users, mefByItem);
        const accountableSE = findAccountableForDivision(item, assignees, concernedRows);
        return {
            id: item.ID,
            parentId: item.ParentID,
            itemName: item.ItemName,
            leadJobCode: item.LeadJobCode,
            assignedSEs: assignees,
            accountableSE: accountableSE || '',
        };
    });
}

function sameVal(a, b) {
    const x = a == null || a === '' ? '' : String(a).trim();
    const y = b == null || b === '' ? '' : String(b).trim();
    return norm(x) === norm(y);
}

async function main() {
    await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_NAME,
        options: { encrypt: false, trustServerCertificate: true },
    });

    const usersRes = await sql.query`
        SELECT FullName, Department FROM Master_ConcernedSE WHERE ISNULL(Status, N'Active') = N'Active'
    `;
    const users = usersRes.recordset || [];

    const mefRes = await sql.query`SELECT ItemName, DepartmentName FROM Master_EnquiryFor`;
    const mefByItem = new Map();
    for (const row of mefRes.recordset || []) {
        mefByItem.set(norm(row.ItemName), row);
        if (row.DepartmentName) mefByItem.set(norm(row.DepartmentName), row);
    }

    const reqFilter = REQUEST_NO
        ? `WHERE c.RequestNo = @requestNo`
        : `WHERE c.RequestNo IS NOT NULL AND LTRIM(RTRIM(c.RequestNo)) <> N''`;

    const req = new sql.Request();
    if (REQUEST_NO) req.input('requestNo', sql.NVarChar, REQUEST_NO);

    const enquiries = await req.query(`
        SELECT DISTINCT c.RequestNo
        FROM ConcernedSE c
        ${reqFilter}
        ORDER BY c.RequestNo
    `);

    const summary = {
        enquiries: 0,
        wouldUpdate: 0,
        skipped: 0,
        needsReview: [],
        updates: [],
    };

    for (const { RequestNo } of enquiries.recordset || []) {
        const efRes = await sql.query`
            SELECT ID, ParentID, ItemName, LeadJobCode
            FROM EnquiryFor
            WHERE RequestNo = ${RequestNo}
            ORDER BY ID
        `;
        const structure = efRes.recordset || [];
        if (structure.length === 0) {
            summary.skipped += 1;
            summary.needsReview.push({ RequestNo, reason: 'No EnquiryFor rows' });
            continue;
        }

        const csRes = await sql.query`
            SELECT ID, SEName, leadjobcode, LeadJobCode, accountability, Accountability, ownjob, OwnJob
            FROM ConcernedSE
            WHERE RequestNo = ${RequestNo}
        `;
        const concernedRows = csRes.recordset || [];
        const seNames = [...new Set(concernedRows.map((r) => String(r.SEName || '').trim()).filter(Boolean))];
        if (seNames.length === 0) continue;

        summary.enquiries += 1;

        const synthetic = buildSyntheticEnquiryFor(structure, seNames, users, mefByItem, concernedRows);

        for (const row of synthetic) {
            const assignees = row.assignedSEs || [];
            if (assignees.length > 1 && !row.accountableSE) {
                summary.needsReview.push({
                    RequestNo,
                    division: row.itemName,
                    assignees,
                    reason: 'Multiple members — no accountable marker',
                });
            }
        }

        const proposed = buildConcernedSEAssignmentsFromEnquiryFor(synthetic);
        const proposedByName = new Map(proposed.map((p) => [norm(p.seName), p]));

        for (const row of concernedRows) {
            const seName = String(row.SEName || '').trim();
            const plan = proposedByName.get(norm(seName));
            if (!plan) continue;

            const next = {
                leadJobCode: plan.leadJobCode || null,
                accountability: plan.accountability || null,
                ownJob: plan.ownJob || null,
            };
            const cur = {
                leadJobCode: row.leadjobcode || row.LeadJobCode || null,
                accountability: row.accountability || row.Accountability || null,
                ownJob: row.ownjob || row.OwnJob || null,
            };

            const changed =
                !sameVal(cur.leadJobCode, next.leadJobCode) ||
                !sameVal(cur.accountability, next.accountability) ||
                !sameVal(cur.ownJob, next.ownJob);

            if (!changed) continue;

            summary.wouldUpdate += 1;
            summary.updates.push({
                id: row.ID,
                RequestNo,
                SEName: seName,
                from: cur,
                to: next,
            });

            if (APPLY) {
                await sql.query`
                    UPDATE ConcernedSE
                    SET leadjobcode = ${next.leadJobCode},
                        accountability = ${next.accountability},
                        ownjob = ${next.ownJob}
                    WHERE ID = ${row.ID}
                `;
            }
        }
    }

    console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', ...summary }, null, 2));
    await sql.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
