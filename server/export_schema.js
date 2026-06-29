const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function exportSchema() {
    try {
        await sql.connect(config);
        console.log('Connected to database.');

        let schemaScript = "-- Auto-generated Schema Export --\n";
        schemaScript += "-- WARNING: THIS SCRIPT WILL WIPE ALL DATA IN THE DATABASE --\n";
        schemaScript += "-- IT IS INTENDED FOR A CLEAN REBUILD --\n\n";

        // PREAMBLE: Drop all Foreign Keys to prevent dependency errors during DROP TABLE
        schemaScript += "-- 1. Drop all Foreign Key Constraints first (to allow dropping tables)\n";
        schemaScript += "DECLARE @sql NVARCHAR(MAX) = N'';\n";
        schemaScript += "SELECT @sql += 'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id))\n";
        schemaScript += "    + '.' + QUOTENAME(OBJECT_NAME(parent_object_id)) \n";
        schemaScript += "    + ' DROP CONSTRAINT ' + QUOTENAME(name) + ';'\n";
        schemaScript += "FROM sys.foreign_keys;\n";
        schemaScript += "EXEC sp_executesql @sql;\n";
        schemaScript += "GO\n\n";

        // Get all tables
        const result = await sql.query`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`;
        const tables = result.recordset.map(r => r.TABLE_NAME);

        for (const tableName of tables) {
            console.log(`Exporting table: ${tableName}`);
            schemaScript += `-- Table: ${tableName}\n`;

            // Generate Drop if exists
            schemaScript += `IF OBJECT_ID('[dbo].[${tableName}]', 'U') IS NOT NULL DROP TABLE [dbo].[${tableName}];\n`;
            schemaScript += `GO\n\n`; // Add GO for separation if running manually in SSMS, though node driver doesn't like it in one batch. We'll strip it purely for file output.

            schemaScript += `CREATE TABLE [dbo].[${tableName}] (\n`;

            // Get Columns
            const cols = await sql.query(`
                SELECT 
                    COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = '${tableName}'
                ORDER BY ORDINAL_POSITION
            `);

            const columnDefs = [];
            for (const col of cols.recordset) {
                let def = `    [${col.COLUMN_NAME}] ${col.DATA_TYPE.toUpperCase()}`;

                if (['nvarchar', 'varchar', 'char', 'nchar'].includes(col.DATA_TYPE)) {
                    const len = col.CHARACTER_MAXIMUM_LENGTH === -1 ? 'MAX' : col.CHARACTER_MAXIMUM_LENGTH;
                    def += `(${len})`;
                }

                if (col.IS_NULLABLE === 'NO') {
                    def += ' NOT NULL';
                }

                // Default constraints are tricky to script perfectly from InfoSchema alone without names, 
                // but we can try to approximate or omit if needed. 
                // However, for a rebuild, defaults are important (e.g., GETDATE(), 'Active').
                if (col.COLUMN_DEFAULT) {
                    // Clean up default value (often wrapped in parens like ((0)))
                    let d = col.COLUMN_DEFAULT;
                    while (d.startsWith('(') && d.endsWith(')')) {
                        d = d.substring(1, d.length - 1);
                    }
                    // Quote strings if needed, but SQL usually stores them quoted
                    def += ` DEFAULT ${col.COLUMN_DEFAULT}`;
                }

                // Check for Identity
                const identityRes = await sql.query(`
                    SELECT is_identity 
                    FROM sys.columns 
                    WHERE object_id = object_id('${tableName}') 
                    AND name = '${col.COLUMN_NAME}'
                `);
                if (identityRes.recordset[0].is_identity) {
                    def += ' IDENTITY(1,1)';
                }

                columnDefs.push(def);
            }

            // Get Primary Key
            const pkRes = await sql.query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
                WHERE TABLE_NAME = '${tableName}' 
                AND CONSTRAINT_NAME LIKE 'PK%'
            `);
            if (pkRes.recordset.length > 0) {
                const pkCol = pkRes.recordset[0].COLUMN_NAME;
                // It's cleaner to add PK inline or at end. Let's add at end.
                columnDefs.push(`    PRIMARY KEY ([${pkCol}])`);
            }

            schemaScript += columnDefs.join(',\n');
            schemaScript += `\n);\nGO\n\n`;
        }

        const outputPath = path.join(__dirname, '..', 'Current_Schema_Export.sql');

        // Remove 'GO' lines if we want a pure script that works in node wrappers, but for a user manual run in SSMS, GO is good.
        // The user said "rebuild it", implying manual run or script run. 
        // I will keep GO as it is standard TS-SQL delimeter.

        fs.writeFileSync(outputPath, schemaScript);
        console.log(`Schema exported to: ${outputPath}`);
        process.exit(0);

    } catch (err) {
        console.error('Error exporting schema:', err);
        process.exit(1);
    }
}

exportSchema();
