require('dotenv').config();
const { sql, connectDB } = require('../dbConfig');

async function checkQuotes() {
    try {
        await connectDB();
        const result = await new sql.Request().query(`SELECT * FROM EnquiryQuotes WHERE RequestNo = '54'`);
        console.log(JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkQuotes();
