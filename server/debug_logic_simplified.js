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

async function run() {
    try {
        await sql.connect(config);

        const enqRes = await sql.query(`SELECT DISTINCT E.RequestNo, E.CustomerName FROM EnquiryMaster E WHERE E.RequestNo = '51'`);
        const enq = enqRes.recordset[0];
        console.log('Enquiry:', JSON.stringify(enq));

        const jobsRes = await sql.query(`SELECT ID, ItemName FROM EnquiryFor WHERE RequestNo = '51'`);
        const jobs = jobsRes.recordset;
        console.log('Jobs:', JSON.stringify(jobs));

        const pricesRes = await sql.query(`
            SELECT PV.EnquiryForID, PV.EnquiryForItem, PV.Price, PO.CustomerName
            FROM EnquiryPricingValues PV
            JOIN EnquiryPricingOptions PO ON PV.OptionID = PO.ID
            WHERE PV.RequestNo = '51'
        `);
        const prices = pricesRes.recordset;

        console.log('--- PRICES Found ---');
        console.log(JSON.stringify(prices));

        const elecJob = jobs.find(j => j.ItemName.includes('Electrical'));
        if (elecJob) {
            console.log(`\nEval Electrical Job: ${elecJob.ItemName} (${elecJob.ID})`);

            const matches = prices.filter(p =>
                (p.EnquiryForID == elecJob.ID) ||
                (p.EnquiryForItem && p.EnquiryForItem.toString().trim() == elecJob.ItemName.toString().trim())
            );
            console.log('Matches:', JSON.stringify(matches));

        } else {
            console.log('Electrical job not found');
        }

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}
run();
