const { sql, connectDB, dbConfig } = require('./dbConfig');
const fs = require('fs');

async function checkEnquiry() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT * FROM EnquiryMaster WHERE RequestNo = '20'`;
        fs.writeFileSync('enquiry20_results.json', JSON.stringify(result.recordset, null, 2));
        console.log('Results saved to enquiry20_results.json');
    } catch (err) {
        console.error('DB Error:', err);
    } finally {
        await sql.close();
    }
}

checkEnquiry();
