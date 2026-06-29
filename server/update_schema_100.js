const sql = require('mssql');
const { dbConfig: config } = require('./dbConfig');

async function updateSchema() {
    try {
        await sql.connect(config);
        console.log('Connected to database...');

        // 1. Add ParentItemName column if it doesn't exist
        try {
            await sql.query`
                IF NOT EXISTS (
                    SELECT * FROM sys.columns 
                    WHERE object_id = OBJECT_ID(N'[dbo].[EnquiryFor]') 
                    AND name = 'ParentItemName'
                )
                BEGIN
                    ALTER TABLE [dbo].[EnquiryFor] ADD ParentItemName NVARCHAR(255) NULL;
                    PRINT 'Added ParentItemName column';
                END
            `;
            console.log('Schema check/update complete: ParentItemName column.');
        } catch (err) {
            console.error('Error adding column:', err.message);
        }

        // 2. Update Hierarchy for Enquiry 100
        // Civil (Lead) -> Electrical (Sub) -> BMS (Sub of Sub)
        try {
            // First, clear existing parents for 100 to be safe
            await sql.query`UPDATE EnquiryFor SET ParentItemName = NULL WHERE RequestNo = '100'`;

            // Civil is Lead (Top) - Parent stays NULL
            // Electrical is Child of Civil
            await sql.query`
                UPDATE EnquiryFor 
                SET ParentItemName = 'Civil' 
                WHERE RequestNo = '100' AND ItemName = 'Electrical'
            `;

            // BMS is Child of Electrical
            await sql.query`
                UPDATE EnquiryFor 
                SET ParentItemName = 'Electrical' 
                WHERE RequestNo = '100' AND ItemName = 'BMS'
            `;

            console.log('Hierarchy updated for Enquiry 100.');
        } catch (err) {
            console.error('Error updating hierarchy:', err.message);
        }

        // 3. Verify
        const result = await sql.query`SELECT ItemName, ParentItemName FROM EnquiryFor WHERE RequestNo = '100'`;
        console.table(result.recordset);

    } catch (err) {
        console.error('Fatal Error:', err);
    } finally {
        await sql.close();
    }
}

updateSchema();
