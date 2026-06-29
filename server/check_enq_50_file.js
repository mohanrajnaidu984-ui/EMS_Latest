const { connectDB, sql } = require('./dbConfig');
const fs = require('fs');

async function checkEnq50File() {
    try {
        await connectDB();
        const requestNo = '50';

        let output = `--- REPORT for Enq ${requestNo} ---\n`;

        // 1. Customers
        const cust = await sql.query`SELECT ID, CustomerName FROM EnquiryCustomer WHERE RequestNo = ${requestNo}`;
        output += `\n--- CUSTOMERS ---\n`;
        cust.recordset.forEach(c => output += `ID: ${c.ID}, Name: "${c.CustomerName}"\n`);

        // 2. Items
        const items = await sql.query`SELECT ID, ItemName, ParentID FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        output += `\n--- ITEMS ---\n`;
        items.recordset.forEach(i => output += `ID: ${i.ID}, Name: "${i.ItemName}", PID: ${i.ParentID}\n`);

        fs.writeFileSync('enq50_report.txt', output);
        console.log('Report written to enq50_report.txt');

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkEnq50File();
