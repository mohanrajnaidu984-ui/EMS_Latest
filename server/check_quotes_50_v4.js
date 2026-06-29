const { connectDB, sql } = require('./dbConfig');

async function checkQuotes() {
    try {
        await connectDB();
        const requestNo = '50';

        console.log(`\n--- EXISTING QUOTES for Enq ${requestNo} ---`);
        const quotes = await sql.query`SELECT QuoteNumber, QuoteNo, RevisionNo FROM EnquiryQuotes WHERE RequestNo = ${requestNo}`;
        console.table(quotes.recordset);

        console.log(`\n--- LEAD JOB CODES for Enq ${requestNo} ---`);
        // Use full join just in case, and check for the column 'LeadJobCode'
        const items = await sql.query`
            SELECT ef.ItemName, mef.LeadJobCode 
            FROM EnquiryFor ef
            LEFT JOIN Master_EnquiryFor mef ON ef.ItemName = mef.ItemName
            WHERE ef.RequestNo = ${requestNo}
        `;
        // Check if LeadJobCode has data, or if it's returning undefined for some reason
        console.table(items.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkQuotes();
