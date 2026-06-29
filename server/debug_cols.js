const sql = require('mssql');

const config = {
    user: 'bmsuser',
    password: 'bms@acg123',
    server: '151.50.1.116',
    database: 'EMS_DB',
    options: {
        encrypt: false, // Use true for Azure SQL
        trustServerCertificate: true // Change to true for local dev / self-signed certs
    }
};

async function run() {
    try {
        console.log('Connecting...');
        await sql.connect(config);

        const r = await sql.query("SELECT TOP 1 * FROM EnquiryPricingOptions");
        console.log("Columns:", Object.keys(r.recordset[0]));

        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

run();
