const sql = require('mssql');
const dbConfig = require('./dbConfig');

async function checkEnquiry43() {
    try {
        await sql.connect(dbConfig);

        console.log('=== ENQUIRY 43 ANALYSIS ===\n');

        // Get all pricing options for enquiry 43
        const result = await sql.query`
            SELECT 
                o.ID as OptionID,
                o.OptionName,
                o.ItemName as OptionItemName,
                o.CustomerName,
                v.EnquiryForID,
                v.EnquiryForItem,
                v.Price,
                ef.ItemName as JobItemName
            FROM EnquiryPricingOptions o
            LEFT JOIN EnquiryPricingValues v ON o.ID = v.OptionID AND o.RequestNo = v.RequestNo
            LEFT JOIN EnquiryFor ef ON v.EnquiryForID = ef.ID
            WHERE o.RequestNo = 43
            ORDER BY o.ID
        `;

        console.log('Total options:', result.recordset.length);
        console.log('\nOptions detail:');
        result.recordset.forEach(row => {
            const status = row.Price > 0 ? `✓ ${row.Price}` : '✗ NO PRICE';
            console.log(`  ${row.OptionName} | Item: ${row.OptionItemName || 'NULL'} | Job: ${row.JobItemName || 'NULL'} | ${status}`);
        });

        // Check which options have no price
        const noPriceOptions = result.recordset.filter(r => !r.Price || r.Price <= 0);
        console.log(`\n${noPriceOptions.length} options without prices:`);
        noPriceOptions.forEach(row => {
            console.log(`  - ${row.OptionName} (ItemName: "${row.OptionItemName}")`);
        });

        await sql.close();

    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkEnquiry43();
