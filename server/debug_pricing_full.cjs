const sql = require('mssql');

const config = {
    user: 'bmsuser',
    password: 'bms@acg123',
    server: '151.50.1.116',
    database: 'EMS_DB',
    options: { encrypt: false, trustServerCertificate: true }
};

async function debug() {
    try {
        await sql.connect(config);
        console.log('=== PRICING DEBUG FOR ENQUIRY 16 ===\n');

        // 1. Jobs hierarchy
        const jobs = (await sql.query("SELECT ID, ParentID, ItemName, LeadJobCode FROM EnquiryFor WHERE RequestNo = '16' ORDER BY ID")).recordset;
        console.log('--- JOBS (EnquiryFor) ---');
        jobs.forEach(j => console.log(`  ID=${j.ID}, ParentID=${j.ParentID || 'ROOT'}, Name="${j.ItemName}", Code=${j.LeadJobCode}`));

        // 2. Master emails for these jobs
        console.log('\n--- MASTER EMAIL ASSIGNMENTS ---');
        for (const job of jobs) {
            const master = (await sql.query(`SELECT CommonMailIds, CCMailIds FROM Master_EnquiryFor WHERE ItemName = '${job.ItemName.replace(/'/g, "''")}'`)).recordset;
            if (master.length > 0) {
                console.log(`  "${job.ItemName}": Common=[${master[0].CommonMailIds}] CC=[${master[0].CCMailIds}]`);
            } else {
                const cleanName = job.ItemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                const master2 = (await sql.query(`SELECT CommonMailIds, CCMailIds FROM Master_EnquiryFor WHERE ItemName = '${cleanName.replace(/'/g, "''")}'`)).recordset;
                if (master2.length > 0) {
                    console.log(`  "${job.ItemName}" [via clean "${cleanName}"]: Common=[${master2[0].CommonMailIds}] CC=[${master2[0].CCMailIds}]`);
                } else {
                    console.log(`  "${job.ItemName}": NO MASTER FOUND`);
                }
            }
        }

        // 3. All pricing options
        const options = (await sql.query("SELECT ID, OptionName, ItemName, CustomerName, LeadJobName FROM EnquiryPricingOptions WHERE RequestNo = '16' ORDER BY ID")).recordset;
        console.log('\n--- PRICING OPTIONS ---');
        options.forEach(o => console.log(`  ID=${o.ID}, Name="${o.OptionName}", Item="${o.ItemName}", Customer="${o.CustomerName}", Lead="${o.LeadJobName}"`));

        // 4. All pricing values
        const values = (await sql.query("SELECT OptionID, EnquiryForID, EnquiryForItem, Price, CustomerName, UpdatedAt FROM EnquiryPricingValues WHERE RequestNo = '16' ORDER BY OptionID, EnquiryForID")).recordset;
        console.log('\n--- PRICING VALUES ---');
        values.forEach(v => {
            const opt = options.find(o => o.ID === v.OptionID);
            const job = jobs.find(j => j.ID === v.EnquiryForID);
            console.log(`  OptID=${v.OptionID} (${opt?.OptionName}), JobID=${v.EnquiryForID} (${job?.ItemName || v.EnquiryForItem}), Cust="${v.CustomerName}", Price=${v.Price}`);
        });

        // 5. Enquiry master
        const enq = (await sql.query("SELECT RequestNo, ProjectName, CustomerName FROM EnquiryMaster WHERE RequestNo = '16'")).recordset;
        console.log('\n--- ENQUIRY ---');
        enq.forEach(e => console.log(`  #${e.RequestNo}: ${e.ProjectName} | Customer: ${e.CustomerName}`));

        // 6. Extra customers
        const extra = (await sql.query("SELECT CustomerName FROM EnquiryCustomer WHERE RequestNo = '16'")).recordset;
        console.log('\n--- EXTRA CUSTOMERS (EnquiryCustomer) ---');
        extra.forEach(c => console.log(`  "${c.CustomerName}"`));

        // 7. Check if there's a user "electrical" or specific email
        const users = (await sql.query("SELECT FullName, EmailId, Roles, Department FROM Master_ConcernedSE WHERE LOWER(Department) LIKE '%electric%' OR LOWER(FullName) LIKE '%electric%'")).recordset;
        console.log('\n--- ELECTRICAL USERS ---');
        users.forEach(u => console.log(`  ${u.FullName} | Email: ${u.EmailId} | Dept: ${u.Department} | Role: ${u.Roles}`));

        await sql.close();
    } catch (e) {
        console.error('ERROR:', e.message);
        process.exit(1);
    }
}
debug();
