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
        connectionTimeout: 10000, // Shorter timeout for quick retry
        requestTimeout: 10000,
        enableArithAbort: true
    }
};

async function retryConnection() {
    console.log(`Attempting to connect to ${config.server}...`);
    try {
        await sql.connect(config);
        console.log('SUCCESS: Connected to MSSQL Database');
        const result = await sql.query('SELECT TOP 1 RequestNo FROM EnquiryMaster');
        console.log('Data Test Result:', result.recordset);
    } catch (err) {
        console.error('FAILURE: Connection failed.');
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
    } finally {
        await sql.close();
        process.exit(0);
    }
}

retryConnection();
