const sql = require('mssql');
require('dotenv').config();

async function addQuote() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        await sql.query`
            INSERT INTO EnquiryQuotes (
                RequestNo, QuoteNumber, QuoteNo, RevisionNo, ValidityDays, 
                PreparedBy, Status, QuoteDate
            ) VALUES (
                97, 'AAC/97/1-R0', 1, 0, 30, 
                'Test User', 'Draft', GETDATE()
            )
        `;
        console.log('Inserted dummy quote for 97');
        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

addQuote();
