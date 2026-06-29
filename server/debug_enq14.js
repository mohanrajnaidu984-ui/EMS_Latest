const sql = require('mssql');
const { dbConfig } = require('./dbConfig');
const { getHierarchyMetadata, filterJobsByDepartment } = require('./services/hierarchyService');

async function debugEnquiry14() {
    try {
        await sql.connect(dbConfig);
        const requestNo = '14';
        const userEmail = 'bms@almoayyedcg.com'; // Abubacker
        const userFullName = 'Abubacker Siddique';

        const enqRes = await sql.query`SELECT * FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
        const enq = enqRes.recordset[0];
        if (!enq) { console.log("Enq 14 not found"); process.exit(); }

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

        console.log("MyJobs Count:", myJobs.length);
        console.log("MyJobs Names:", myJobs.map(j => j.ItemName));

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
            console.log("TopJob:", topJob.ItemName, "Level:", metaMap[topJob.ID].level);
            if (metaMap[topJob.ID] && metaMap[topJob.ID].customer) {
                parentSet.add(metaMap[topJob.ID].customer);
            }
        }

        console.log("ParentSet items:", Array.from(parentSet));

        let finalCustomers = Array.from(parentSet).filter(c => {
            const cNorm = normalize(cleanOwnJob(c));
            if (myJobNamesRaw.has(cNorm)) return false;
            return true;
        });

        console.log("FinalCustomers before fallback:", finalCustomers);

        const rawExternal = (enq.CustomerName || '').split(',').map(c => c.trim()).filter(Boolean);
        const externalCustomers = [];
        const normSet = new Set();
        rawExternal.forEach(c => {
            const norm = c.replace(/[.,\s]+$/, '').toLowerCase();
            if (!normSet.has(norm)) { externalCustomers.push(c); normSet.add(norm); }
        });

        if (finalCustomers.length === 0 && externalCustomers.length > 0) {
            console.log("Falling back to external customers because finalCustomers is empty");
            finalCustomers = externalCustomers;
        }

        console.log("FinalCustomers after fallback:", finalCustomers);
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugEnquiry14();
