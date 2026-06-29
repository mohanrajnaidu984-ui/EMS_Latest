const { sql, connectDB } = require('./dbConfig');

async function checkCodes() {
    try {
        await connectDB();
        const res = await sql.query`
            SELECT ItemName, DivisionCode, DepartmentCode 
            FROM Master_EnquiryFor 
            WHERE ItemName LIKE '%AC Maint%'
        `;
        console.table(res.recordset);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkCodes();
