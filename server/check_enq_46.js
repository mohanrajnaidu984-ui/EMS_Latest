const { connectDB, sql } = require('./dbConfig');

async function check() {
    try {
        await connectDB();
        console.log('Connected to database.');

        const result = await sql.query`
            SELECT ID, RequestNo, ItemName, LeadJobCode, ParentID 
            FROM EnquiryFor 
            WHERE RequestNo = '46' 
            ORDER BY ID
        `;

        console.log('\n=== Enquiry 46 - EnquiryFor Items ===');
        console.log('ID | ItemName | LeadJobCode | ParentID');
        console.log('---|----------|-------------|----------');

        result.recordset.forEach(row => {
            console.log(`${row.ID} | ${row.ItemName} | ${row.LeadJobCode || 'NULL'} | ${row.ParentID || 'NULL'}`);
        });

        console.log('\n=== Summary ===');
        const withCode = result.recordset.filter(r => r.LeadJobCode);
        const withoutCode = result.recordset.filter(r => !r.LeadJobCode);
        console.log(`Total items: ${result.recordset.length}`);
        console.log(`With LeadJobCode: ${withCode.length}`);
        console.log(`Without LeadJobCode (NULL): ${withoutCode.length}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

check();
