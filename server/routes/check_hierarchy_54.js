require('dotenv').config();
const { sql, connectDB } = require('../dbConfig');

async function checkHierarchy() {
    try {
        await connectDB();
        const result = await new sql.Request().query(`
      SELECT *
      FROM EnquiryFor 
      WHERE RequestNo = '54'
    `);
        console.log('Hierarchy for Enquiry 54:');
        console.log(JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkHierarchy();
