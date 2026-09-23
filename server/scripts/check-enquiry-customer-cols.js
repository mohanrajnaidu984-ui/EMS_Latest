'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, connectDB } = require('../dbConfig');

(async () => {
    await connectDB();
    const r = await sql.query`
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME IN (N'EnquiryMaster', N'EnquiryCustomer', N'ReceivedFrom')
          AND COLUMN_NAME IN (N'CustomerName', N'ReceivedFrom', N'ContactName', N'CompanyName')
        ORDER BY TABLE_NAME, COLUMN_NAME
    `;
    console.table(r.recordset);

    const len = await sql.query`
        SELECT
            LEN(ISNULL(CustomerName, N'')) AS CustomerNameLen,
            LEN(ISNULL(ReceivedFrom, N'')) AS ReceivedFromLen,
            LEFT(ISNULL(CustomerName, N''), 120) AS CustomerNameStart
        FROM EnquiryMaster
        WHERE LTRIM(RTRIM(RequestNo)) = N'996'
    `;
    console.table(len.recordset);
    process.exit(0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
