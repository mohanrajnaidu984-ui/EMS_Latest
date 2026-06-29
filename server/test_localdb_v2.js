const sql = require('mssql');
const config = {
    server: '(localdb)\\MSSQLLocalDB',
    database: 'master',
    driver: 'msnodesqlv8',
    options: {
        trustedConnection: true,
        trustServerCertificate: true,
    }
};

async function test() {
    try {
        console.log('Connecting to LocalDB...');
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
