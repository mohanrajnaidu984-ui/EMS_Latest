require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');

(async () => {
  const pool = await sql.connect({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: { encrypt: false, trustServerCertificate: true },
  });
  const r = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'EnquiryQuotes'
    ORDER BY ORDINAL_POSITION
  `);
  console.table(r.recordset);
  await pool.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
