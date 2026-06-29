const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

async function checkEnq9() {
    try {
        await connectDB();
        const res = await sql.query`SELECT * FROM EnquiryFor WHERE RequestNo = '9'`;
        const res2 = await sql.query`SELECT * FROM EnquiryPricingValues WHERE RequestNo = '9'`;
        const res3 = await sql.query`SELECT * FROM EnquiryPricingOptions WHERE RequestNo = '9'`;

        const output = {
            enquiryFor: res.recordset,
            pricingValues: res2.recordset,
            pricingOptions: res3.recordset
        };

        fs.writeFileSync('enq9_data.json', JSON.stringify(output, null, 2));
        console.log('Data saved to enq9_data.json');

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

checkEnq9();
