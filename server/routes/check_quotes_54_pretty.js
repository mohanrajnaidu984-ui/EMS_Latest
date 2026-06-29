require('dotenv').config();
const { sql, connectDB } = require('../dbConfig');

async function checkQuotes() {
    try {
        await connectDB();
        const result = await new sql.Request().query(`
      SELECT *
      FROM EnquiryQuotes 
      WHERE RequestNo = '54'
    `);
        console.log('Quotes for Enquiry 54:');
        result.recordset.forEach(q => {
            console.log(`ID: ${q.ID} | QNo: ${q.QuoteNumber} | Rev: ${q.RevisionNo} | To: ${q.ToName} | Status: ${q.Status}`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkQuotes();
