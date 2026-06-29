const { sql, connectDB } = require('./dbConfig');

async function inspect97() {
    try {
        await connectDB();

        console.log('--- EnquiryFor for 97 ---');
        const eFor = await sql.query`SELECT * FROM EnquiryFor WHERE RequestNo = '97'`;
        console.log(JSON.stringify(eFor.recordset, null, 2));

        console.log('\n--- EnquiryQuotes for 97 ---');
        const eQuotes = await sql.query`SELECT QuoteNumber, TotalAmount, CreatedAt FROM EnquiryQuotes WHERE RequestNo = '97'`;
        console.log(JSON.stringify(eQuotes.recordset, null, 2));

        console.log('\n--- Master_EnquiryFor ---');
        const mEFor = await sql.query`SELECT ItemName, CommonMailIds, CCMailIds FROM Master_EnquiryFor`;
        console.log(JSON.stringify(mEFor.recordset, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

inspect97();
