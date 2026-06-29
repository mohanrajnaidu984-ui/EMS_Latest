require('dotenv').config();
const { sql, connectDB } = require('../dbConfig');

async function checkSchema() {
    try {
        await connectDB();
        const result = await new sql.Request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'EnquiryQuotes'
      AND COLUMN_NAME = 'RequestNo'
    `);
        console.log(JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();
