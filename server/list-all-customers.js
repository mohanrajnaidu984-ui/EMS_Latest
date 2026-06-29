const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 30000,
        requestTimeout: 30000,
        enableArithAbort: true
    }
};

async function checkAllCustomerTables() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(config);
        console.log('Connected!');

        // Check Master_CustomerName
        console.log('\n=== Master_CustomerName ===');
        const customers = await pool.request().query(`SELECT * FROM Master_CustomerName`);
        console.log(`Count: ${customers.recordset.length}`);
        if (customers.recordset.length > 0) {
            console.table(customers.recordset);
        }

        // Check Master_ClientName
        console.log('\n=== Master_ClientName ===');
        const clients = await pool.request().query(`SELECT * FROM Master_ClientName`);
        console.log(`Count: ${clients.recordset.length}`);
        if (clients.recordset.length > 0) {
            console.table(clients.recordset);
        }

        // Check Master_ConsultantName
        console.log('\n=== Master_ConsultantName ===');
        const consultants = await pool.request().query(`SELECT * FROM Master_ConsultantName`);
        console.log(`Count: ${consultants.recordset.length}`);
        if (consultants.recordset.length > 0) {
            console.table(consultants.recordset);
        }

        await pool.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

checkAllCustomerTables();
