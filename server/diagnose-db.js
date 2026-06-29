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

console.log('----------------------------------------');
console.log('Testing Database Connection...');
console.log('----------------------------------------');
console.log('Configuration loaded from .env:');
console.log(`Server:   ${config.server}`);
console.log(`Database: ${config.database}`);
console.log(`User:     ${config.user}`);
console.log(`Password: ${config.password ? '******' : '(missing)'}`);
console.log('----------------------------------------');

async function testConnection() {
    try {
        console.log('Attempting to connect...');
        const pool = await sql.connect(config);
        console.log('✅ Connection Successful!');
        console.log('Connected to:', config.server);
        
        const result = await pool.request().query('SELECT @@VERSION as version');
        console.log('SQL Server Version:', result.recordset[0].version);
        
        await pool.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection Failed!');
        console.error('Error Name:', err.name);
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
        if (err.originalError) {
            console.error('Original Error:', err.originalError.message);
        }
        process.exit(1);
    }
}

testConnection();
