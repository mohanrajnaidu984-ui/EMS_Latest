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
        enableArithAbort: true,
        useUTC: false
    }
};

(async () => {
    try {
        console.log('Connecting to:', config.server, 'with user:', config.user);
        await sql.connect(config);
        console.log('Connected!');
        const result = await sql.query`SELECT @@VERSION`;
        console.log(result.recordset[0]);
        await sql.close();
    } catch (err) {
        console.error('Failed:', err);
    }
})();
