const sql = require('mssql');
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

async function cleanup() {
    try {
        await sql.connect(config);
        console.log('Connected to database.');

        // 1. Identify all duplicate groups (Same RequestNo, OptionName, ItemName, CustomerName)
        const duplicates = await sql.query`
            SELECT RequestNo, OptionName, ItemName, CustomerName, COUNT(*) as Count
            FROM EnquiryPricingOptions
            GROUP BY RequestNo, OptionName, ItemName, CustomerName
            HAVING COUNT(*) > 1
        `;

        if (duplicates.recordset.length === 0) {
            console.log('No duplicates found.');
            process.exit(0);
        }

        console.log(`Found ${duplicates.recordset.length} duplicate groups.`);

        for (const group of duplicates.recordset) {
            console.log(`Processing group: ${group.OptionName} / ${group.CustomerName} / ${group.ItemName}`);

            // Get all IDs for this group
            const idsRes = await sql.query`
                SELECT ID 
                FROM EnquiryPricingOptions 
                WHERE RequestNo = ${group.RequestNo}
                AND OptionName = ${group.OptionName}
                AND (ItemName = ${group.ItemName} OR (ItemName IS NULL AND ${group.ItemName} IS NULL))
                AND (CustomerName = ${group.CustomerName} OR (CustomerName IS NULL AND ${group.CustomerName} IS NULL))
                ORDER BY ID ASC
            `;

            const ids = idsRes.recordset.map(r => r.ID);
            const keepId = ids[0]; // Keep oldest
            const deleteIds = ids.slice(1);

            console.log(`Keeping ID: ${keepId}, Deleting IDs: ${deleteIds.join(', ')}`);

            // Re-link values if any (though we found none, safe to check)
            for (const oldId of deleteIds) {
                await sql.query`
                    UPDATE EnquiryPricingValues 
                    SET OptionID = ${keepId} 
                    WHERE OptionID = ${oldId}
                `;

                await sql.query`
                    DELETE FROM EnquiryPricingOptions WHERE ID = ${oldId}
                `;
            }
        }

        console.log('Cleanup complete.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

cleanup();
