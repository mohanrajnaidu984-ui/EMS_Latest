const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

async function inspect97() {
    try {
        await connectDB();

        const eFor = await sql.query`SELECT * FROM EnquiryFor WHERE RequestNo = '97'`;
        const eQuotes = await sql.query`SELECT QuoteNumber, TotalAmount, CreatedAt FROM EnquiryQuotes WHERE RequestNo = '97'`;
        const mEFor = await sql.query`SELECT ItemName, CommonMailIds, CCMailIds FROM Master_EnquiryFor`;

        const data = {
            EnquiryFor: eFor.recordset,
            EnquiryQuotes: eQuotes.recordset,
            Master_EnquiryFor: mEFor.recordset
        };

        fs.writeFileSync('inspect_97_full.json', JSON.stringify(data, null, 2));
        console.log('Inspection data written to inspect_97_full.json');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

inspect97();
