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
        console.log('Connecting...');
        await sql.connect(config);

        console.log('\n--- EnquiryPricingValues > 0 ---');
        const r = await sql.query(`
            SELECT V.ID, V.OptionID, V.EnquiryForItem, V.Price, O.CustomerName 
            FROM EnquiryPricingValues V 
            JOIN EnquiryPricingOptions O ON V.OptionID = O.ID 
            WHERE V.RequestNo = '51' AND V.Price > 0
        `);
        console.log(JSON.stringify(r.recordset, null, 2));

        console.log('\n--- ALL Electrical Values ---');
        const r2 = await sql.query(`
            SELECT V.ID, V.OptionID, V.EnquiryForItem, V.Price, O.CustomerName 
            FROM EnquiryPricingValues V 
            JOIN EnquiryPricingOptions O ON V.OptionID = O.ID 
            WHERE V.RequestNo = '51' AND (V.EnquiryForItem LIKE '%Electrical%' OR O.ItemName LIKE '%Electrical%')
        `);
        console.log(JSON.stringify(r2.recordset, null, 2));

        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

run();
