const { connectDB, sql } = require('./dbConfig');

async function migrate() {
    try {
        await connectDB();
        console.log('Connected to database.');

        // 1. Check if column exists, if not create it
        const colCheck = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryFor' AND COLUMN_NAME = 'LeadJobCode'
        `;

        if (colCheck.recordset.length === 0) {
            console.log('Adding LeadJobCode column...');
            await sql.query`ALTER TABLE EnquiryFor ADD LeadJobCode NVARCHAR(50)`;
            console.log('Column added.');
        } else {
            console.log('LeadJobCode column already exists.');
        }

        // 2. Fetch all rows
        const result = await sql.query`SELECT ID, ItemName FROM EnquiryFor`;
        const updates = [];

        console.log(`Found ${result.recordset.length} rows. Processing...`);

        // Regex to match "L1 - Name", "L2 - Name", etc.
        // It should match "L" followed by digits, spaces, hyphen, spaces, then the name.
        const regex = /^(L\d+)\s+-\s+(.*)$/;

        for (const row of result.recordset) {
            const { ID, ItemName } = row;
            if (!ItemName) continue;

            const match = ItemName.match(regex);
            if (match) {
                const code = match[1]; // e.g., "L1"
                const name = match[2]; // e.g., "Civil Project"

                updates.push({
                    ID,
                    LeadJobCode: code,
                    CleanItemName: name,
                    Original: ItemName
                });
            }
        }

        console.log(`Found ${updates.length} rows to update.`);

        // 3. Update rows
        // Using a loop for safety, though batch update is faster. Given the volume might be small, loop is fine.
        for (const update of updates) {
            const req = new sql.Request();
            req.input('id', sql.Int, update.ID);
            req.input('code', sql.NVarChar, update.LeadJobCode);
            req.input('name', sql.NVarChar, update.CleanItemName);

            await req.query`
                UPDATE EnquiryFor 
                SET LeadJobCode = @code, ItemName = @name 
                WHERE ID = @id
            `;
            console.log(`Updated ID ${update.ID}: '${update.Original}' -> Code: '${update.LeadJobCode}', Name: '${update.CleanItemName}'`);
        }

        console.log('Migration complete.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        // sql.close(); // Keep connection open if running in a larger process, or close if standalone.
        // For standalone script, we should usually close or let node exit. 
        // But the pool might keep it open. Let's explicitly close.
        // Actually, existing scripts don't seem to close explicitly or rely on process exit.
        process.exit(0);
    }
}

migrate();
