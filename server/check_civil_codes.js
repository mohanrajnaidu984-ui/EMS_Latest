const { sql, connectDB } = require('./dbConfig');

async function checkCivilCodes() {
    try {
        await connectDB();
        const res = await sql.query`
            SELECT ItemName, DivisionCode, DepartmentCode, CompanyName 
            FROM Master_EnquiryFor 
            WHERE ItemName LIKE '%Civil%'
        `;
        console.log('Civil Codes:');
        console.table(res.recordset);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkCivilCodes();
