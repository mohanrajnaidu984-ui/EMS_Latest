const { connectDB, sql } = require('./dbConfig');

async function checkEnquiry50Structure() {
    try {
        console.log('Connecting...');
        await connectDB();
        const requestNo = '50';

        const result = await sql.query`SELECT ID, ItemName, ParentID FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        const items = result.recordset;

        console.log(`--- ITEMS Enq ${requestNo} ---`);
        items.forEach(i => {
            console.log(`ID: ${i.ID}, Name: "${i.ItemName}", PID: ${i.ParentID}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkEnquiry50Structure();
