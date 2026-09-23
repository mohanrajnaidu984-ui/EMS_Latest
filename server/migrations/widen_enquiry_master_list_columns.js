'use strict';
/**
 * Widen EnquiryMaster denormalized list columns that store comma-joined customer /
 * received-from / consultant names. NVARCHAR(255) truncates once ~8 long company
 * names are saved ("String or binary data would be truncated").
 *
 * Usage: node server/migrations/widen_enquiry_master_list_columns.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, connectDB, disconnectDB } = require('../dbConfig');

const COLUMNS = ['CustomerName', 'ReceivedFrom', 'ConsultantName'];

async function widenColumn(tableName, columnName) {
    const info = await sql.query`
        SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = ${tableName}
          AND COLUMN_NAME = ${columnName}
    `;
    const col = info.recordset?.[0];
    if (!col) {
        console.log(`[skip] ${tableName}.${columnName} — column not found`);
        return;
    }
    const maxLen = Number(col.CHARACTER_MAXIMUM_LENGTH);
    if (col.DATA_TYPE === 'nvarchar' && (maxLen === -1 || maxLen >= 4000)) {
        console.log(`[ok] ${tableName}.${columnName} already wide (len=${maxLen})`);
        return;
    }
    console.log(
        `[alter] ${tableName}.${columnName} ${col.DATA_TYPE}(${maxLen}) → NVARCHAR(MAX)`
    );
    await sql.query(`
        ALTER TABLE [${tableName}] ALTER COLUMN [${columnName}] NVARCHAR(MAX) NULL
    `);
    console.log(`[done] ${tableName}.${columnName}`);
}

(async () => {
    await connectDB();
    for (const col of COLUMNS) {
        await widenColumn('EnquiryMaster', col);
    }
    await disconnectDB();
    process.exit(0);
})().catch(async (err) => {
    console.error('[widen_enquiry_master_list_columns] failed:', err);
    try {
        await disconnectDB();
    } catch (_) {
        /* ignore */
    }
    process.exit(1);
});
