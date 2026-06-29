const sql = require('mssql');
require('dotenv').config();

async function findReceivedFromTable() {
    try {
        await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: { encrypt: false, trustServerCertificate: true }
        });

        // Find all tables with 'Received' in the name
        const tables = await sql.query`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME LIKE '%Received%'
        `;

        console.log('Tables with "Received" in name:');
        for (const table of tables.recordset) {
            console.log(`\n  ${table.TABLE_NAME}:`);

            // Get columns
            const cols = await sql.query`
                SELECT COLUMN_NAME, DATA_TYPE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = ${table.TABLE_NAME}
            `;
            cols.recordset.forEach(c => {
                console.log(`    - ${c.COLUMN_NAME} (${c.DATA_TYPE})`);
            });

            // Check if it has data for Enquiry 44
            try {
                const count = await sql.query`
                    SELECT COUNT(*) as count 
                    FROM ${sql.Table(table.TABLE_NAME)}
                    WHERE RequestNo = '44'
                `;
                if (count.recordset[0].count > 0) {
                    console.log(`    ✓ Has ${count.recordset[0].count} records for Enquiry 44`);
                }
            } catch (e) {
                // Table might not have RequestNo column
            }
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        sql.close();
    }
}

findReceivedFromTable();
