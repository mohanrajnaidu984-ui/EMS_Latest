const sql = require('mssql');
const config = {
    server: 'localhost',
    database: 'master',
    options: {
        encrypt: false,
        trustServerCertificate: true,
    },
    driver: 'msnodesqlv8' // Use Windows Authentication
};

async function test() {
    try {
        await sql.connect(config);
        console.log('Connected!');
        const result = await sql.query('SELECT name FROM sys.databases');
        console.log(result.recordset);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}
test();
