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

        const jobs = (await sql.query("SELECT ID, ItemName FROM EnquiryFor WHERE RequestNo = '51'")).recordset;
        console.log('JOBS LIST:');
        console.table(jobs);

        const prices = (await sql.query(`
            SELECT PV.ID as P_ID, PV.EnquiryForID as ForID, PV.EnquiryForItem as ForItem, PV.Price, PO.CustomerName
            FROM EnquiryPricingValues PV
            JOIN EnquiryPricingOptions PO ON PV.OptionID = PO.ID
            WHERE PV.RequestNo = '51'
        `)).recordset;

        console.log('PRICES LIST:');
        console.table(prices);

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

run();
