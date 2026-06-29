const sql = require('mssql');
const { dbConfig } = require('./dbConfig');
const { getHierarchyMetadata, filterJobsByDepartment } = require('./services/hierarchyService');
const fs = require('fs');

async function debugEnquiry14() {
    let output = '';
    const log = (msg) => { output += msg + '\n'; console.log(msg); };
    
    try {
        await sql.connect(dbConfig);
        const requestNo = '14';
        const userEmail = 'bms@almoayyedcg.com'; // Abubacker
        const userFullName = 'Abubacker Siddique';

        const enqRes = await sql.query`SELECT * FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
        const enq = enqRes.recordset[0];
        if (!enq) { log("Enq 14 not found"); fs.writeFileSync('debug_enq14_res.txt', output); process.exit(); }

        const jobsRes = await sql.query`
            SELECT 
                EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName, EF.LeadJobCode,
                MEF.CommonMailIds, MEF.CCMailIds
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo = ${requestNo}
        `;
        const enqJobs = jobsRes.recordset;

        const myJobs = filterJobsByDepartment(enqJobs, {
            userDepartment: '',
            isAdmin: false,
            isCreator: false,
            isConcernedSE: false,
            userEmail: userEmail,
            userFullName: userFullName
        });

        log("MyJobs Count: " + myJobs.length);
        log("MyJobs Names: " + myJobs.map(j => j.ItemName).join(', '));

        const metaMap = getHierarchyMetadata(enqJobs, enq.CustomerName);
        
        const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanOwnJob = (name) => name ? name.replace(/^(L\d+|Sub Job)\s*-?\s*/i, '').trim() : '';
        const myJobNamesRaw = new Set(myJobs.map(j => normalize(cleanOwnJob(j.ItemName))));

        const parentSet = new Set();
        if (myJobs.length > 0) {
            const topJob = myJobs.reduce((prev, curr) => {
                const prevLevel = (metaMap[prev.ID] && metaMap[prev.ID].level) || 99;
                const currLevel = (metaMap[curr.ID] && metaMap[curr.ID].level) || 99;
                return (currLevel < prevLevel) ? curr : prev;
            });
            log("TopJob: " + topJob.ItemName + " Level: " + metaMap[topJob.ID].level);
            if (metaMap[topJob.ID] && metaMap[topJob.ID].customer) {
                parentSet.add(metaMap[topJob.ID].customer);
                log("Added to ParentSet: " + metaMap[topJob.ID].customer);
            }
        }

        log("ParentSet items: " + Array.from(parentSet).join(', '));

        let finalCustomers = Array.from(parentSet).filter(c => {
            const cNorm = normalize(cleanOwnJob(c));
            if (myJobNamesRaw.has(cNorm)) return false;
            return true;
        });

        log("FinalCustomers before fallback: " + finalCustomers.join(', '));

        const rawExternal = (enq.CustomerName || '').split(',').map(c => c.trim()).filter(Boolean);
        const externalCustomers = [];
        const normSet = new Set();
        rawExternal.forEach(c => {
            const norm = c.replace(/[.,\s]+$/, '').toLowerCase();
            if (!normSet.has(norm)) { externalCustomers.push(c); normSet.add(norm); }
        });

        if (finalCustomers.length === 0 && externalCustomers.length > 0) {
            log("Falling back to external customers because finalCustomers is empty");
            finalCustomers = externalCustomers;
        }

        log("FinalCustomers after fallback: " + finalCustomers.join(', '));
        fs.writeFileSync('debug_enq14_res.txt', output);
        process.exit();
    } catch (err) {
        log(err.stack);
        fs.writeFileSync('debug_enq14_res.txt', output);
        process.exit(1);
    }
}

debugEnquiry14();
