const sql = require('mssql');
const dbConfig = require('./dbConfig');

async function debugEnquiry43() {
    try {
        await sql.connect(dbConfig);

        const requestNo = 43;

        console.log('\n=== ENQUIRY 43 DEBUG ===\n');

        // 1. Get Jobs
        console.log('1. JOBS (EnquiryFor):');
        const jobs = await sql.query`
            SELECT ID, ParentID, ItemName 
            FROM EnquiryFor 
            WHERE RequestNo = ${requestNo}
            ORDER BY ID
        `;
        console.log(JSON.stringify(jobs.recordset, null, 2));

        // 2. Get Pricing Options
        console.log('\n2. PRICING OPTIONS (EnquiryPricingOptions):');
        const options = await sql.query`
            SELECT ID, OptionName, ItemName, CustomerName, LeadJobName
            FROM EnquiryPricingOptions 
            WHERE RequestNo = ${requestNo}
            ORDER BY ID
        `;
        console.log(JSON.stringify(options.recordset, null, 2));

        // 3. Get Pricing Values
        console.log('\n3. PRICING VALUES (EnquiryPricingValues):');
        const values = await sql.query`
            SELECT OptionID, EnquiryForID, EnquiryForItem, Price, CustomerName, LeadJobName
            FROM EnquiryPricingValues 
            WHERE RequestNo = ${requestNo}
            ORDER BY OptionID, EnquiryForID
        `;
        console.log(JSON.stringify(values.recordset, null, 2));

        // 4. Check for options without prices
        console.log('\n4. OPTIONS WITHOUT PRICES:');
        for (const option of options.recordset) {
            const hasPrice = values.recordset.some(v =>
                v.OptionID === option.ID && v.Price > 0
            );
            if (!hasPrice) {
                console.log(`  - Option "${option.OptionName}" (ID: ${option.ID}, ItemName: "${option.ItemName}") has NO PRICE`);
            }
        }

        // 5. Get user assignment for Electrical
        console.log('\n5. JOB ASSIGNMENTS (Master_EnquiryFor):');
        const assignments = await sql.query`
            SELECT ItemName, CommonMailIds, CCMailIds
            FROM Master_EnquiryFor
            WHERE ItemName IN (SELECT ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo})
        `;
        console.log(JSON.stringify(assignments.recordset, null, 2));

        await sql.close();

    } catch (err) {
        console.error('Error:', err);
    }
}

debugEnquiry43();
