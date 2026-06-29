const { connectDB, sql } = require('./dbConfig');

async function checkExistingQuotes() {
    try {
        await connectDB();
        const requestNo = '50';

        console.log(`\n--- EXISTING QUOTES for Enq ${requestNo} ---`);
        const quotes = await sql.query`SELECT QuoteNumber, QuoteNo, RevisionNo FROM EnquiryQuotes WHERE RequestNo = ${requestNo}`;
        console.table(quotes.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkExistingQuotes();
