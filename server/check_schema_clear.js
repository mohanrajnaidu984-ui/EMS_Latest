const { connectDB, sql } = require('./dbConfig');

async function checkSchema() {
    try {
        console.log('Connecting...');
        await connectDB();

        console.log('\n--- Master_EnquiryFor Columns ---');
        const mCols = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Master_EnquiryFor'
        `;
        // One per line
        mCols.recordset.forEach(c => console.log(c.COLUMN_NAME));

        console.log('\n--- EnquiryFor Columns ---');
        const eCols = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryFor'
        `;
        eCols.recordset.forEach(c => console.log(c.COLUMN_NAME));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkSchema();
