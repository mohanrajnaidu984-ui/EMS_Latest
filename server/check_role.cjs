const sql = require('mssql');
require('dotenv').config();
const cfg = { user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_NAME, options: { encrypt: false, trustServerCertificate: true } };
sql.connect(cfg).then(async () => {
    const r = await sql.query("SELECT EmailId, Roles, Department FROM Master_ConcernedSE WHERE EmailId = 'electrical@almoayyedcg.com'");
    console.log(JSON.stringify(r.recordset));
    process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
