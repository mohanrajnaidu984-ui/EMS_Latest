const sql = require('mssql');
require('dotenv').config();

const config = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

async function cleanupDuplicates() {
    try {
        await sql.connect(config);

        console.log('Finding duplicate revisions for Enquiry 107...\n');

        // Find all quotes for 107
        const allQuotes = await sql.query`
            SELECT ID, QuoteNumber, QuoteNo, RevisionNo, ToName, CreatedAt
            FROM EnquiryQuotes 
            WHERE RequestNo = '107'
            ORDER BY QuoteNo, RevisionNo, CreatedAt DESC
        `;

        // Group by QuoteNo + RevisionNo + ToName to find duplicates
        const groups = {};
        allQuotes.recordset.forEach(q => {
            const key = `${q.QuoteNo}-${q.RevisionNo}-${q.ToName}`;
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(q);
        });

        // Find and delete duplicates (keep the latest one)
        let deletedCount = 0;
        for (const [key, quotes] of Object.entries(groups)) {
            if (quotes.length > 1) {
                console.log(`\nFound ${quotes.length} duplicates for ${key}:`);
                quotes.forEach((q, idx) => {
                    console.log(`  ${idx + 1}. ID: ${q.ID}, QuoteNumber: ${q.QuoteNumber}, Created: ${q.CreatedAt}`);
                });

                // Keep the first one (latest), delete the rest
                const toDelete = quotes.slice(1);
                console.log(`\nKeeping ID ${quotes[0].ID} (latest), deleting ${toDelete.length} duplicates...`);

                for (const q of toDelete) {
                    await sql.query`DELETE FROM EnquiryQuotes WHERE ID = ${q.ID}`;
                    console.log(`  ✓ Deleted ID ${q.ID}`);
                    deletedCount++;
                }
            }
        }

        console.log(`\n\n=== CLEANUP COMPLETE ===`);
        console.log(`Total duplicates deleted: ${deletedCount}`);

        // Show remaining quotes
        const remaining = await sql.query`
            SELECT ID, QuoteNumber, QuoteNo, RevisionNo, ToName, Status
            FROM EnquiryQuotes 
            WHERE RequestNo = '107'
            ORDER BY QuoteNo, RevisionNo DESC
        `;

        console.log(`\nRemaining quotes: ${remaining.recordset.length}`);
        remaining.recordset.forEach(q => {
            console.log(`  - ${q.QuoteNumber} (ID: ${q.ID}, ToName: ${q.ToName}, Status: ${q.Status})`);
        });

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await sql.close();
    }
}

cleanupDuplicates();
