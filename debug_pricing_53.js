const { getPricingDetails } = require('./server/index.js'); // Hypothetical, need to check how to call logic
const dbConfig = require('./server/dbConfig');
const sql = require('mssql');

async function debugPricing() {
    try {
        await sql.connect(dbConfig);

        const requestNo = '53'; // From screenshot
        const userEmail = 'electrical@test.com'; // user is electrical

        console.log(`Checking pricing for RequestNo: ${requestNo}`);

        // 1. Check Enquiry Master
        const enq = await sql.query`SELECT * FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
        console.log('Enquiry:', enq.recordset[0]);

        // 2. Check Options
        const options = await sql.query`
            SELECT * FROM PricingOptions 
            WHERE RequestNo = ${requestNo} 
            ORDER BY ItemName, Name
        `;
        console.log('All Options:', options.recordset);

        // 3. Check Values
        const values = await sql.query`
            SELECT * FROM PricingValues 
            WHERE RequestNo = ${requestNo}
        `;
        console.log('Values Count:', values.recordset.length);

        // 4. Check Jobs (EnquiryFor)
        const jobs = await sql.query`
            SELECT * FROM EnquiryFor 
            WHERE RequestNo = ${requestNo}
        `;
        console.log('Jobs:', jobs.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

debugPricing();
