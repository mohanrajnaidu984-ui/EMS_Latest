const { connectDB, sql } = require('./dbConfig');

async function checkEnquiry50() {
    try {
        await connectDB();
        const requestNo = '50';

        console.log('--- CUSTOMERS (EnquiryCustomer) ---');
        let customers = await sql.query`SELECT ID, CustomerName FROM EnquiryCustomer WHERE RequestNo = ${requestNo}`;
        customers.recordset.forEach(c => console.log(`${c.ID}: ${c.CustomerName}`));

        console.log('\n--- ITEMS (EnquiryFor) ---');
        let items = await sql.query`SELECT ID, ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        items.recordset.forEach(i => console.log(`${i.ID}: ${i.ItemName}`));

        const itemNames = items.recordset.map(i => i.ItemName);
        if (itemNames.length > 0) {
            console.log('\n--- MASTER DATA (Master_EnquiryFor) ---');
            for (const name of itemNames) {
                // Check if LeadJobCode column exists by selecting it
                // If it fails, we know it doesn't exist.
                try {
                    const mItem = await sql.query`SELECT ItemName, LeadJobCode FROM Master_EnquiryFor WHERE ItemName = ${name}`;
                    if (mItem.recordset.length > 0) {
                        console.log(`Item: ${name} -> LeadJobCode: ${mItem.recordset[0].LeadJobCode}`);
                    } else {
                        console.log(`Item: ${name} -> NOT FOUND in Master`);
                    }
                } catch (e) {
                    console.log(`Error checking Master for ${name}: ${e.message}`);
                }
            }
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkEnquiry50();
