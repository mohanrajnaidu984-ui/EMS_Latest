require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

async function listCols() {
    try {
        await connectDB();
        const result = await sql.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryMaster'
            ORDER BY COLUMN_NAME
        `);
        console.log("COL_START");
        result.recordset.forEach(r => console.log(r.COLUMN_NAME));
        console.log("COL_END");
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

listCols();
