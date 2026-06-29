const { connectDB, sql } = require('./dbConfig');

async function debugPricing() {
    try {
        await connectDB();
        const requestNo = '16';

        const options = await sql.query`SELECT ID, OptionName, SortOrder, ItemName, CustomerName, LeadJobName FROM EnquiryPricingOptions WHERE RequestNo = ${requestNo} ORDER BY ID`;
        const values = await sql.query`SELECT OptionID, EnquiryForID, EnquiryForItem, Price, CustomerName FROM EnquiryPricingValues WHERE RequestNo = ${requestNo} ORDER BY OptionID`;
        const jobs = await sql.query`SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo} ORDER BY ID`;

        console.log('=== OPTIONS ===');
        options.recordset.forEach(o => {
            console.log(`ID:${o.ID} | Name:${o.OptionName} | Item:${o.ItemName} | Cust:${o.CustomerName} | Lead:${o.LeadJobName}`);
        });

        console.log('=== VALUES ===');
        values.recordset.forEach(v => {
            console.log(`OptID:${v.OptionID} | ForID:${v.EnquiryForID} | ForItem:${v.EnquiryForItem} | Price:${v.Price} | Cust:${v.CustomerName}`);
        });

        console.log('=== JOBS ===');
        jobs.recordset.forEach(j => {
            console.log(`ID:${j.ID} | ParentID:${j.ParentID} | Name:${j.ItemName}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

debugPricing();
