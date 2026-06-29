const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function deleteQuote() {
    try {
        await sql.connect(dbConfig);
        const quoteRef = 'AAC/CVLP/107-L1/5-R0';

        // 1. Check if quote exists in EnquiryQuotes
        const result = await sql.query`SELECT ID FROM EnquiryQuotes WHERE QuoteNumber = ${quoteRef}`;

        if (result.recordset.length === 0) {
            console.log(`Quote ${quoteRef} not found in EnquiryQuotes.`);
            // Try searching by partial match if exact match fails
            const partial = await sql.query`SELECT QuoteNumber FROM EnquiryQuotes WHERE QuoteNumber LIKE '%107-L1/5-R0'`;
            if (partial.recordset.length > 0) {
                console.log('Found similar quotes:', partial.recordset);
            }
            return;
        }

        const quoteId = result.recordset[0].ID;
        console.log(`Found Quote ID: ${quoteId} for ${quoteRef}`);

        // 2. Delete the record
        await sql.query`DELETE FROM EnquiryQuotes WHERE ID = ${quoteId}`;

        console.log(`Successfully deleted quote ${quoteRef} from EnquiryQuotes table.`);

    } catch (err) {
        console.error('Error deleting quote:', err);
    } finally {
        await sql.close();
    }
}

deleteQuote();
