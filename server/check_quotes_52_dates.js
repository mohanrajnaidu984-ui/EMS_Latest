const { connectDB, sql } = require('./dbConfig');

async function checkQuotes() {
    try {
        await connectDB();
        const result = await sql.query`
            SELECT 
                QuoteID, 
                RequestNo, 
                QuoteNumber, 
                QuoteDate, 
                CreatedAt, 
                CONVERT(VARCHAR, QuoteDate, 120) as QuoteDateRaw, 
                CONVERT(VARCHAR, CreatedAt, 120) as CreatedAtRaw,
                CONVERT(VARCHAR(10), QuoteDate, 23) as QuoteDateString,
                CONVERT(VARCHAR(10), CreatedAt, 23) as CreatedAtString
            FROM EnquiryQuotes 
            WHERE RequestNo = '52'
        `;
        console.log('Quotes for Enquiry 52:', JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkQuotes();
