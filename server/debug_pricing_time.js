const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

connectDB().then(async () => {
    try {
        const res = await sql.query("SELECT COLUMN_NAME, COLUMN_DEFAULT, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryPricingValues'");
        fs.writeFileSync('schema_pricing_values.json', JSON.stringify(res.recordset, null, 2));
        console.log('Schema written to schema_pricing_values.json');

        const res2 = await sql.query("SELECT TOP 5 RequestNo, UpdatedAt FROM EnquiryPricingValues ORDER BY UpdatedAt DESC");
        fs.writeFileSync('sample_pricing_values.json', JSON.stringify(res2.recordset, null, 2));
        console.log('Sample data written to sample_pricing_values.json');

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
});
