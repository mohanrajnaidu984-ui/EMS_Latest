require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

async function getQuotes() {
    try {
        await connectDB();
        const result = await new sql.Request().query(`SELECT QuoteNumber, QuoteID, ToName, RequestNo FROM QuoteMaster WHERE RequestNo = '54'`);
        console.log(JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

getQuotes();
