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

        console.log('--- ENQUIRY 51 ---');

        // Fetch Jobs
        const jobs = (await sql.query("SELECT ID, ItemName FROM EnquiryFor WHERE RequestNo = '51'")).recordset;
        console.log('JOBS_START');
        jobs.forEach(j => console.log(JSON.stringify(j)));
        console.log('JOBS_END');

        // Fetch Prices with Option Info
        const prices = (await sql.query(`
            SELECT PV.ID, PV.OptionID, PV.EnquiryForID, PV.EnquiryForItem, PV.Price, PO.CustomerName
            FROM EnquiryPricingValues PV
            JOIN EnquiryPricingOptions PO ON PV.OptionID = PO.ID
            WHERE PV.RequestNo = '51'
        `)).recordset;

        console.log('PRICES_START');
        prices.forEach(p => console.log(JSON.stringify(p)));
        console.log('PRICES_END');

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

run();
