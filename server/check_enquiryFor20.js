const { sql, connectDB, dbConfig } = require('./dbConfig');
const fs = require('fs');

async function checkEnquiryFor() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT * FROM EnquiryFor WHERE RequestNo = '20'`;
        fs.writeFileSync('enquiryFor20_results.json', JSON.stringify(result.recordset, null, 2));
        console.log('Results saved to enquiryFor20_results.json');
    } catch (err) {
        console.error('DB Error:', err);
    } finally {
        await sql.close();
    }
}

checkEnquiryFor();
