const sql = require('mssql');
const config = {
    user: 'bmsuser',
    password: 'bms@acg123',
    server: '151.50.1.116',
    database: 'EMS_DB',
    options: { encrypt: false, trustServerCertificate: true }
};

async function run() {
    try {
        await sql.connect(config);
        const jobs = (await sql.query("SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = '51'")).recordset;

        const selfJobId = 130;
        const selfJobIds = [selfJobId];

        console.log('--- Type Check ---');
        jobs.forEach(j => {
            if (j.ID === 130 || j.ID === 131) {
                console.log(`Job ${j.ID} (${typeof j.ID}) Name: ${j.ItemName} Parent: ${j.ParentID} (${typeof j.ParentID})`);
            }
        });

        const getAllDescendantIds = (parentIds, allJobs) => {
            let descendantIds = [];
            let queue = [...parentIds];
            let processed = new Set();
            while (queue.length > 0) {
                const currentId = queue.pop();
                console.log(`Processing Parent: ${currentId} (${typeof currentId})`);
                if (processed.has(currentId)) continue;
                processed.add(currentId);

                const children = allJobs.filter(j => {
                    // Check specific link 130 -> 131
                    if (j.ParentID === 130 || j.ID === 131) {
                        // console.log(`   Compare Job ${j.ID} Parent ${j.ParentID} === ${currentId}: ${j.ParentID === currentId}`);
                    }
                    return j.ParentID === currentId;
                });
                children.forEach(c => {
                    console.log(`   Found Child: ${c.ID}`);
                    descendantIds.push(c.ID);
                    queue.push(c.ID);
                });
            }
            return descendantIds;
        };

        const descendants = getAllDescendantIds(selfJobIds, jobs);
        console.log('Descendants Found:', descendants);

        await sql.close();
    } catch (e) {
        console.error(e);
    }
}
run();
