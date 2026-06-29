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
        console.log("Columns:", JSON.stringify(result.recordset.map(r => r.COLUMN_NAME)));
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

listCols();
