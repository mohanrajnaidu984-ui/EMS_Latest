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

async function deleteWrongRevisions() {
    try {
        await sql.connect(config);

        console.log('Deleting revisions with wrong lead job prefix...\n');

        // Delete ID 34: AAC/BMS/107-L1/3-R1 (should be L2)
        // Delete ID 31: AAC/BMS/107-L1/3-R1 (should be L2)
        // Delete ID 30: AAC/BMS/107-L1/4-R1 (should be L2)

        const idsToDelete = [34, 31, 30];

        for (const id of idsToDelete) {
            const quote = await sql.query`SELECT * FROM EnquiryQuotes WHERE ID = ${id}`;
            if (quote.recordset.length > 0) {
                const q = quote.recordset[0];
                console.log(`Deleting ID ${id}: ${q.QuoteNumber} (ToName: ${q.ToName})`);
                await sql.query`DELETE FROM EnquiryQuotes WHERE ID = ${id}`;
                console.log(`  ✓ Deleted\n`);
            } else {
                console.log(`ID ${id} not found (already deleted?)\n`);
            }
        }

        console.log('=== CLEANUP COMPLETE ===\n');

        // Show remaining quotes
        const remaining = await sql.query`
            SELECT ID, QuoteNumber, QuoteNo, RevisionNo, ToName, Status
            FROM EnquiryQuotes 
            WHERE RequestNo = '107'
            ORDER BY QuoteNo, RevisionNo DESC
        `;

        console.log(`Remaining quotes: ${remaining.recordset.length}`);
        remaining.recordset.forEach(q => {
            console.log(`  - ${q.QuoteNumber} (ID: ${q.ID}, ToName: ${q.ToName})`);
        });

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await sql.close();
    }
}

deleteWrongRevisions();
