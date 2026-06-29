require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

async function resetEnquiry54() {
    try {
        await connectDB();
        console.log('--- Resetting Enquiry 54 Prices ---');

        // Update Price to 0 for RequestNo 54
        const result = await new sql.Request().query(`
            UPDATE EnquiryPricingValues 
            SET Price = 0, UpdatedAt = GETDATE() 
            WHERE RequestNo = '54'
        `);

        console.log(`Rows updated: ${result.rowsAffected[0]}`);
        console.log('Enquiry 54 prices have been reset to 0.');

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

resetEnquiry54();
