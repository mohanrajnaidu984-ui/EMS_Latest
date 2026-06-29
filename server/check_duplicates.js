const { connectDB, sql } = require('./dbConfig');

async function checkEnquiry50Duplicates() {
    try {
        await connectDB();
        const requestNo = '50';

        console.log(`\n--- CUSTOMERS for Enq ${requestNo} ---`);

        // precise check with length to spot hidden chars
        const result = await sql.query`SELECT ID, CustomerName FROM EnquiryCustomer WHERE RequestNo = ${requestNo}`;
        result.recordset.forEach(c => {
            console.log(`ID: ${c.ID} | Name: "${c.CustomerName}" | Length: ${c.CustomerName.length}`);
            console.log(`Hex: ${Buffer.from(c.CustomerName).toString('hex')}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkEnquiry50Duplicates();
