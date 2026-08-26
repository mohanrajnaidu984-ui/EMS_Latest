require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');

/** Widen EnquiryQuotesDraft string columns that are smaller than the intended schema / EnquiryQuotes. */
const ALTERS = [
    ['ToName', 4000],
    ['ToEmail', 255],
    ['PreparedByEmail', 255],
    ['CustomerReference', 255],
    ['ToPhone', 100],
    ['PreparedBy', 255],
    ['Signatory', 255],
    ['SignatoryDesignation', 255],
    ['CoSignatory', 255],
    ['CoSignatoryDesignation', 255],
    ['Subject', 500],
    ['QuoteNumber', 255],
];

(async () => {
    await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE,
        options: { encrypt: false, trustServerCertificate: true },
    });

    for (const [col, chars] of ALTERS) {
        const check = await new sql.Request()
            .input('col', sql.NVarChar, col)
            .query(`
                SELECT t.name AS TYPE_NAME, c.max_length
                FROM sys.columns c
                JOIN sys.types t ON c.user_type_id = t.user_type_id
                WHERE c.object_id = OBJECT_ID('dbo.EnquiryQuotesDraft') AND c.name = @col
            `);
        const row = check.recordset[0];
        if (!row) {
            console.log(`SKIP ${col} (missing)`);
            continue;
        }
        const current =
            row.max_length === -1 ? Number.POSITIVE_INFINITY : row.TYPE_NAME.startsWith('n') ? row.max_length / 2 : row.max_length;
        if (current >= chars) {
            console.log(`OK   ${col} already ${current === Infinity ? 'MAX' : current}`);
            continue;
        }
        const sqlText = `ALTER TABLE dbo.EnquiryQuotesDraft ALTER COLUMN [${col}] NVARCHAR(${chars}) NULL`;
        console.log(`ALTER ${col}: ${current} -> ${chars}`);
        await new sql.Request().query(sqlText);
    }

    console.log('Done.');
    await sql.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
