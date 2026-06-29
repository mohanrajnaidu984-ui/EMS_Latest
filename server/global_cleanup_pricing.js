const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        await sql.connect(config);

        console.log('Finding duplicates...');
        const duplicates = await sql.query`
            SELECT RequestNo, OptionName, ItemName, CustomerName, COUNT(*) as Count
            FROM EnquiryPricingOptions 
            GROUP BY RequestNo, OptionName, ItemName, CustomerName
            HAVING COUNT(*) > 1
        `;

        console.log(`Found ${duplicates.recordset.length} sets of duplicates.`);

        for (const dup of duplicates.recordset) {
            console.log(`Cleaning up: ${dup.OptionName} / ${dup.ItemName} / ${dup.CustomerName} for Request ${dup.RequestNo}`);

            // Get all IDs for this set
            const idsResult = await sql.query`
                SELECT ID FROM EnquiryPricingOptions
                WHERE RequestNo = ${dup.RequestNo}
                AND OptionName = ${dup.OptionName}
                AND (ItemName = ${dup.ItemName} OR (ItemName IS NULL AND ${dup.ItemName || null} IS NULL))
                AND (CustomerName = ${dup.CustomerName} OR (CustomerName IS NULL AND ${dup.CustomerName || null} IS NULL))
                ORDER BY ID ASC
            `;

            const ids = idsResult.recordset.map(r => r.ID);
            const masterId = ids[0];
            const idsToDelete = ids.slice(1);

            console.log(`- Keeping ID: ${masterId}`);
            console.log(`- Deleting IDs: ${idsToDelete.join(', ')}`);

            for (const id of idsToDelete) {
                // MOVE VALUES to Master ID before deleting (to be safe)
                await sql.query`
                    UPDATE EnquiryPricingValues 
                    SET OptionID = ${masterId} 
                    WHERE OptionID = ${id}
                `;
                // DELETE duplicates
                await sql.query`DELETE FROM EnquiryPricingOptions WHERE ID = ${id}`;
            }
        }

        console.log('Global cleanup complete.');

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

run();
