const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const sql = require('mssql');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 5000
    }
};

console.log('--- Debug DB Config ---');
console.log('Server:', config.server);
console.log('User:', config.user);
console.log('Database:', config.database);
console.log('Password Length:', config.password ? config.password.length : 0);
console.log('Password Starts With:', config.password ? config.password.substring(0, 1) : 'N/A');
console.log('Password Ends With:', config.password ? config.password.substring(config.password.length - 1) : 'N/A');

(async () => {
    try {
        console.log('Attempting connection...');
        await sql.connect(config);
        console.log('SUCCESS: Connected to MSSQL');
        process.exit(0);
    } catch (err) {
        console.error('FAILURE:', err.message);
        process.exit(1);
    }
})();
