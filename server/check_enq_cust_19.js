const { sql, connectDB, dbConfig } = require('./dbConfig');
const fs = require('fs');

async function checkEnquiryCustomer() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT * FROM EnquiryCustomer WHERE RequestNo = '19'`;
        fs.writeFileSync('enq_cust_19.json', JSON.stringify(result.recordset, null, 2));
        console.log('Results saved to enq_cust_19.json');
    } catch (err) {
        console.error('DB Error:', err);
    } finally {
        await sql.close();
    }
}

checkEnquiryCustomer();
