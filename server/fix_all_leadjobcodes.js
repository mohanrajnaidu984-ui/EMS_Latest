const { connectDB, sql } = require('./dbConfig');

async function fixAllNullLeadJobCodes() {
    try {
        await connectDB();
        console.log('Connected to database.');

        // Find all root items (ParentID IS NULL) that don't have a LeadJobCode
        const result = await sql.query`
            SELECT ID, RequestNo, ItemName, LeadJobCode, ParentID 
            FROM EnquiryFor 
            WHERE ParentID IS NULL AND LeadJobCode IS NULL
            ORDER BY RequestNo, ID
        `;

        console.log(`\nFound ${result.recordset.length} root items without LeadJobCode\n`);

        // Group by RequestNo to assign sequential codes per enquiry
        const byRequest = {};
        result.recordset.forEach(row => {
            if (!byRequest[row.RequestNo]) {
                byRequest[row.RequestNo] = [];
            }
            byRequest[row.RequestNo].push(row);
        });

        let totalUpdated = 0;

        for (const [reqNo, items] of Object.entries(byRequest)) {
            console.log(`\n=== Enquiry ${reqNo} ===`);

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const leadCode = `L${i + 1}`;

                const req = new sql.Request();
                req.input('id', sql.Int, item.ID);
                req.input('code', sql.NVarChar, leadCode);

                await req.query`UPDATE EnquiryFor SET LeadJobCode = @code WHERE ID = @id`;

                console.log(`  Updated ID ${item.ID} (${item.ItemName}): LeadJobCode = ${leadCode}`);
                totalUpdated++;
            }
        }

        console.log(`\n✓ Total updated: ${totalUpdated} items`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

fixAllNullLeadJobCodes();
