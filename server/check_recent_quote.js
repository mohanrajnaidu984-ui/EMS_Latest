const { sql, connectDB, dbConfig } = require('./dbConfig');

async function checkRecentQuote() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT TOP 1 * FROM EnquiryQuotes ORDER BY ID DESC`;
        console.log('Recent Quote:', JSON.stringify(result.recordset[0], null, 2));
    } catch (err) {
        console.error('DB Error:', err);
    } finally {
        await sql.close();
    }
}

checkRecentQuote();
