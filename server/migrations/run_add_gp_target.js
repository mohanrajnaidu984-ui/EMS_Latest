/**
 * Migration: Add GrossProfitTarget column to SalesTargets
 * Run via: node server/migrations/run_add_gp_target.js
 */
const { sql, poolPromise } = require('../dbConfig');

async function migrate() {
    try {
        await poolPromise;
        const result = await sql.query(`
            IF NOT EXISTS (
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'SalesTargets' AND COLUMN_NAME = 'GrossProfitTarget'
            )
            BEGIN
                ALTER TABLE SalesTargets ADD GrossProfitTarget DECIMAL(18, 2) NULL DEFAULT 0;
                SELECT 'Column GrossProfitTarget ADDED' AS Result;
            END
            ELSE
            BEGIN
                SELECT 'Column GrossProfitTarget ALREADY EXISTS - no changes' AS Result;
            END
        `);
        console.log('[Migration]', result.recordset[0]?.Result);
        process.exit(0);
    } catch (err) {
        console.error('[Migration Error]', err.message);
        process.exit(1);
    }
}

migrate();
