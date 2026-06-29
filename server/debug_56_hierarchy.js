const sql = require('mssql');
const config = {
    user: 'bmsuser',
    password: 'bms@acg123',
    server: '151.50.1.116',
    database: 'EMS_DB',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function checkHierarchy() {
    try {
        await sql.connect(config);
        const enq = await sql.query("SELECT RequestNo, ProjectName, CustomerName FROM EnquiryMaster WHERE RequestNo = '56'");
        console.log('--- ENQUIRY MASTER ---');
        console.log(JSON.stringify(enq.recordset, null, 2));

        const res = await sql.query("SELECT ID, ParentID, ItemName, LeadJobCode FROM EnquiryFor WHERE RequestNo = '56'");
        console.log('--- ENQUIRY FOR ---');
        console.log(JSON.stringify(res.recordset, null, 2));

        const options = await sql.query("SELECT DISTINCT CustomerName, ItemName, LeadJobName FROM EnquiryPricingOptions WHERE RequestNo = '56'");
        console.log('--- OPTIONS DETAIL ---');
        console.log(JSON.stringify(options.recordset, null, 2));

        const values = await sql.query("SELECT DISTINCT CustomerName FROM EnquiryPricingValues WHERE RequestNo = '56'");
        console.log('--- CUSTOMERS IN VALUES ---');
        console.log(JSON.stringify(values.recordset, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkHierarchy();
