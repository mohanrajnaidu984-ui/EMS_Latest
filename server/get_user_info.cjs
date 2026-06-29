const sql = require('mssql');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
};

async function main() {
    await sql.connect(config);
    const result = await sql.query("SELECT * FROM Master_ConcernedSE WHERE FullName = 'Lakshmanan Kuppusamy'");
    console.log(JSON.stringify(result.recordset, null, 2));
    await sql.close();
}

main().catch(e => console.error(e.message));
