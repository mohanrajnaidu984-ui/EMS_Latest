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
        
        log("--- Debugging Enq 14 Hierarchy ---");
        const jobsRes = await sql.query`SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        jobsRes.recordset.forEach(j => {
            log(`ID: ${j.ID}, ParentID: ${j.ParentID}, Name: ${j.ItemName}`);
        });

        const enqRes = await sql.query`SELECT CustomerName FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
        log(`EnqMaster CustomerName: ${enqRes.recordset[0].CustomerName}`);

        const metaMap = getHierarchyMetadata(jobsRes.recordset, enqRes.recordset[0].CustomerName);
        Object.keys(metaMap).forEach(id => {
            const m = metaMap[id];
            log(`Job ID ${id}: Level ${m.level}, Customer: ${m.customer}`);
        });

        fs.writeFileSync('debug_enq14_hierarchy.txt', output);
        process.exit();
    } catch (err) {
        log(err.stack);
        fs.writeFileSync('debug_enq14_hierarchy.txt', output);
        process.exit(1);
    }
}

debugEnquiry14();
