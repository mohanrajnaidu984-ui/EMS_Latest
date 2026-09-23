require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');

/** Add Currency column to Master_EnquiryFor (nullable NVARCHAR). */
(async () => {
    await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE,
        options: { encrypt: false, trustServerCertificate: true },
    });

    const check = await sql.query`
        SELECT COL_LENGTH('dbo.Master_EnquiryFor', 'Currency') AS ColLength
    `;
    const colLength = check.recordset?.[0]?.ColLength;
    if (colLength != null) {
        console.log('Column Currency already exists on Master_EnquiryFor.');
    } else {
        await sql.query`
            ALTER TABLE dbo.Master_EnquiryFor
            ADD Currency NVARCHAR(20) NULL
        `;
        console.log('Added Currency NVARCHAR(20) NULL to Master_EnquiryFor.');
    }

    const cols = await sql.query`
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Master_EnquiryFor' AND COLUMN_NAME = 'Currency'
    `;
    console.table(cols.recordset);
    await sql.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
