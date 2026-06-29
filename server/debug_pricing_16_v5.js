const { sql, connectDB } = require('./dbConfig');

async function debugCalculations() {
    try {
        await connectDB();

        console.log('--- ENQUIRY 16 MASTER ---');
        const enq = await sql.query`SELECT RequestNo, LeadJobPrefix, CustomerName FROM EnquiryMaster WHERE RequestNo = '16'`;
        console.table(enq.recordset);

        console.log('\n--- HIERARCHY ---');
        const hierarchy = await sql.query`SELECT ID, ItemName, ParentID, LeadJobCode FROM EnquiryFor WHERE RequestNo = '16'`;
        console.table(hierarchy.recordset);

        console.log('\n--- PRICING OPTIONS ---');
        const options = await sql.query`
            SELECT ID, [Name], ItemName, CustomerName, LeadJobName 
            FROM EnquiryPricingOptions 
            WHERE RequestNo = '16'
        `;
        console.table(options.recordset);

        console.log('\n--- PRICING VALUES ---');
        const values = await sql.query`
            SELECT ID, OptionID, EnquiryForID, Price, CustomerName, ItemName
            FROM EnquiryPricingValues 
            WHERE RequestNo = '16'
        `;
        console.table(values.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

debugCalculations();
