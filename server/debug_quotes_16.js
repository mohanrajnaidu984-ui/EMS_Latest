const { sql, connectDB } = require('./dbConfig');

async function checkQuotes() {
    try {
        await connectDB();
        const result = await sql.query`SELECT ID, QuoteNumber, ToName, RequestNo FROM EnquiryQuotes WHERE RequestNo = '16'`;
        console.log('Quotes for Enquiry 16:');
        console.table(result.recordset);

        const enquiry = await sql.query`SELECT RequestNo, CustomerName, LeadJobPrefix FROM EnquiryMaster WHERE RequestNo = '16'`;
        console.log('Enquiry Master 16:');
        console.table(enquiry.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkQuotes();
