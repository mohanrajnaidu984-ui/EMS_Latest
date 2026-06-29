const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

async function checkEnq9() {
    try {
        await connectDB();
        const res = await sql.query`SELECT CustomerName FROM EnquiryMaster WHERE RequestNo = '9'`;
        console.log('EnquiryMaster for 9:');
        console.table(res.recordset);

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

checkEnq9();
