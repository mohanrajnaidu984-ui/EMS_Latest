require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');

/** Backfill null/blank Master_EnquiryFor.Currency to BHD (legacy EMS default). */
(async () => {
    await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE,
        options: { encrypt: false, trustServerCertificate: true },
    });
    const result = await sql.query`
        UPDATE dbo.Master_EnquiryFor
        SET Currency = N'BHD'
        WHERE Currency IS NULL OR LTRIM(RTRIM(Currency)) = N''
    `;
    console.log('Backfilled Currency=BHD rows:', result.rowsAffected?.[0] ?? result.rowsAffected);
    await sql.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
