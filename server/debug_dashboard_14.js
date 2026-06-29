const sql = require('mssql');
const { dbConfig } = require('./dbConfig');
const { getHierarchyMetadata, filterJobsByDepartment } = require('./services/hierarchyService');
const fs = require('fs');

async function debugDashboardEnq14() {
    let output = '';
    const log = (msg) => { output += msg + '\n'; console.log(msg); };
    
    try {
        await sql.connect(dbConfig);
        const requestNo = '14';
        const userEmail = 'bms@almoayyedcg.com'; // Abubacker
        const userFullName = 'Abubacker Siddique';

        // 1. Fetch Enquiry Detail (like dashboard)
        const enqRes = await sql.query`SELECT RequestNo, CustomerName FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
        const row = enqRes.recordset[0];
        log(`Original DB CustomerName: ${row.CustomerName}`);

        // 2. Fetch All Jobs (like dashboard)
        const jobsRes = await sql.query`
            SELECT EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName, EF.LeadJobCode, MEF.CommonMailIds, MEF.CCMailIds
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo = ${requestNo}
        `;
        const allEnqJobs = jobsRes.recordset;

        const myJobs = filterJobsByDepartment(allEnqJobs, { userDepartment: '', isAdmin: false, isCreator: false, isConcernedSE: false, userEmail, userFullName });
        log("MyJobs Count: " + myJobs.length);

        const metaMap = getHierarchyMetadata(allEnqJobs, row.CustomerName);
        const ctx = { byId: metaMap };

        const parentSet = new Set();
        if (myJobs.length > 0 && ctx) {
            const topJob = myJobs.reduce((prev, curr) => {
                const prevLevel = (ctx.byId[prev.ID] && ctx.byId[prev.ID].level) || 99;
                const currLevel = (ctx.byId[curr.ID] && ctx.byId[curr.ID].level) || 99;
                return (currLevel < prevLevel) ? curr : prev;
            });
            log(`TopJob: ${topJob.ItemName} (ID: ${topJob.ID}, Level: ${ctx.byId[topJob.ID].level})`);
            if (ctx.byId[topJob.ID] && ctx.byId[topJob.ID].customer) {
                parentSet.add(ctx.byId[topJob.ID].customer);
                log(`Resolved Customer from Hierarchy: ${ctx.byId[topJob.ID].customer}`);
            }
        }

        if (parentSet.size > 0) {
            const cleanOwnJob = (name) => name ? name.replace(/^(L\d+|Sub Job)\s*-?\s*/i, '').trim() : '';
            const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
            const myJobNamesRaw = new Set(myJobs.map(j => normalize(cleanOwnJob(j.ItemName))));

            let finalCustomers = Array.from(parentSet).filter(c => {
                const cNorm = normalize(cleanOwnJob(c));
                if (myJobNamesRaw.has(cNorm)) return false;
                return true;
            });

            if (finalCustomers.length > 0) {
                row.CustomerName = finalCustomers.join(', ');
                log(`Updated Dashboard CustomerName: ${row.CustomerName}`);
            }
        }

        fs.writeFileSync('debug_dashboard_res.txt', output);
        process.exit();
    } catch (err) {
        log(err.stack);
        fs.writeFileSync('debug_dashboard_res.txt', output);
        process.exit(1);
    }
}

debugDashboardEnq14();
