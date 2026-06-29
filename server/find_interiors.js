const { sql, connectDB, dbConfig } = require('./dbConfig');
const fs = require('fs');

async function findInteriorsQuote() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT ID, QuoteNumber, OwnJob, ToName FROM EnquiryQuotes WHERE OwnJob LIKE '%Interiors%' OR QuoteNumber LIKE '%AIN%'`;
        fs.writeFileSync('interiors_results.json', JSON.stringify(result.recordset, null, 2));
        console.log('Results saved to interiors_results.json');
    } catch (err) {
        console.error('DB Error:', err);
    } finally {
        await sql.close();
    }
}

findInteriorsQuote();
