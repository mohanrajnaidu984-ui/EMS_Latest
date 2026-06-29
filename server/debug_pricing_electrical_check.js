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

async function check() {
    try {
        await sql.connect(config);

        // 1. Get Options
        const options = (await sql.query("SELECT * FROM EnquiryPricingOptions WHERE RequestNo = '51'")).recordset;

        const elecOpts = options.filter(o =>
            (o.Name && o.Name.includes('Electrical')) ||
            (o.ItemName && o.ItemName.includes('Electrical'))
        );
        console.log(`Electrical Options Found: ${elecOpts.length}`);
        elecOpts.forEach(o => console.log(`  OptID: ${o.ID}, Cust: ${o.CustomerName}`));

        // 2. Get Jobs
        const jobs = (await sql.query("SELECT * FROM EnquiryFor WHERE RequestNo = '51'")).recordset;
        const elecJob = jobs.find(j => j.ItemName.includes('Electrical'));

        if (!elecJob) {
            console.log('CRITICAL: Electrical Job NOT found!');
            return;
        }
        console.log(`Electrical Job ID: ${elecJob.ID}`);

        // 3. Get Values
        const values = (await sql.query("SELECT * FROM EnquiryPricingValues WHERE RequestNo = '51'")).recordset;

        console.log('--- PRICES ---');
        let foundPrice = false;
        values.forEach(v => {
            const opt = elecOpts.find(o => o.ID === v.OptionID);
            if (opt && v.EnquiryForID === elecJob.ID) {
                console.log(`[Price] Opt ${opt.ID} (${opt.CustomerName}) -> Price: ${v.Price}`);
                if (v.Price > 0) foundPrice = true;
            }
        });

        if (!foundPrice) console.log('WARNING: No price > 0 found for Electrical Job on any Electrical Option.');

        await sql.close();
    } catch (e) {
        console.error(e);
    }
}
check();
