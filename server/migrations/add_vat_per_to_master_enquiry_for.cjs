require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

/** Add VAT_Per to Master_EnquiryFor and seed from Currency when null. */
(async () => {
    await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE,
        options: { encrypt: false, trustServerCertificate: true },
    });

    const check = await sql.query`
        SELECT COL_LENGTH('dbo.Master_EnquiryFor', 'VAT_Per') AS ColLength
    `;
    if (check.recordset?.[0]?.ColLength != null) {
        console.log('Column VAT_Per already exists on Master_EnquiryFor.');
    } else {
        await sql.query`
            ALTER TABLE dbo.Master_EnquiryFor
            ADD VAT_Per DECIMAL(9, 4) NULL
        `;
        console.log('Added VAT_Per DECIMAL(9, 4) NULL to Master_EnquiryFor.');
    }

    const seed = await sql.query`
        UPDATE dbo.Master_EnquiryFor
        SET VAT_Per = CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(Currency, N'')))) = N'SAR' THEN 15
            ELSE 10
        END
        WHERE VAT_Per IS NULL;
        SELECT @@ROWCOUNT AS SeededRows;
    `;
    console.log('Seeded VAT_Per on null rows:', seed.recordset?.[0]?.SeededRows ?? 0);

    const sample = await sql.query`
        SELECT TOP 15 ID, ItemName, CompanyName, DepartmentName, Currency, VAT_Per
        FROM dbo.Master_EnquiryFor
        ORDER BY ID DESC
    `;
    console.table(sample.recordset);
    await sql.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
