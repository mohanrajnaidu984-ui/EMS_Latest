const { connectDB, sql } = require('./dbConfig');

async function checkEnquiry50Duplicates() {
    try {
        await connectDB();
        const requestNo = '50';

        console.log(`\n--- CUSTOMERS for Enq ${requestNo} ---`);

        const result = await sql.query`SELECT ID, CustomerName FROM EnquiryCustomer WHERE RequestNo = ${requestNo}`;
        result.recordset.forEach(c => {
            console.log(`ID: ${c.ID}`);
            console.log(`Name: '${c.CustomerName}'`);
            console.log(`Length: ${c.CustomerName.length}`);
            console.log(`Buffer: ${JSON.stringify(Buffer.from(c.CustomerName))}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkEnquiry50Duplicates();
