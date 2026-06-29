const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 30000
    }
};

console.log('Testing connection with config:');
console.log('User:', config.user);
console.log('Server:', config.server);
console.log('Database:', config.database);
// Don't log full password, just length
console.log('Password length:', config.password ? config.password.length : 0);

const connectDB = async () => {
    try {
        await sql.connect(config);
        console.log('✅ SUCCESSFULLY CONNECTED to MSSQL Database');
        process.exit(0);
    } catch (err) {
        console.error('❌ CONNECTION FAILED:', err.message);
        process.exit(1);
    }
};

connectDB();
