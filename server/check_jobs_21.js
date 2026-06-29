const { sql, connectDB } = require('./dbConfig');

async function checkJobs() {
    try {
        await connectDB();
        const res = await sql.query`SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = '21' ORDER BY ID`;
        console.log('Enquiry 21 Jobs:', JSON.stringify(res.recordset, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkJobs();
