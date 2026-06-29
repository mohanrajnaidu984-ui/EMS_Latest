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
        console.log(mCols.recordset.map(c => c.COLUMN_NAME).join(', '));

        console.log('\n--- EnquiryFor Columns ---');
        const eCols = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryFor'
        `;
        console.log(eCols.recordset.map(c => c.COLUMN_NAME).join(', '));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkSchema();
