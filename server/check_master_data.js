const { sql, connectDB } = require('./dbConfig');

async function check() {
    try {
        await connectDB();
        const res = await sql.query`SELECT ItemName, CompanyName, Address, Phone, FaxNo FROM Master_EnquiryFor WHERE ItemName LIKE '%AC Maint%' OR ItemName LIKE '%HVAC%'`;
        console.log(JSON.stringify(res.recordset, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

check();
