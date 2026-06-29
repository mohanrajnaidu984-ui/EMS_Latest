const { sql, connectDB, dbConfig } = require('./dbConfig');
const fs = require('fs');

async function checkCustomer() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT CompanyName, Address1 FROM Master_CustomerName WHERE CompanyName LIKE '%Lulu Group%'`;
        fs.writeFileSync('lulu_group_results.json', JSON.stringify(result.recordset, null, 2));
        console.log('Results saved to lulu_group_results.json');
    } catch (err) {
        console.error('DB Error:', err);
    } finally {
        await sql.close();
    }
}

checkCustomer();
