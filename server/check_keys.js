const { sql, connectDB } = require('./dbConfig');

async function check() {
    try {
        await connectDB();
        const res = await sql.query`SELECT TOP 1 * FROM Master_EnquiryFor`;
        console.log(Object.keys(res.recordset[0]));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

check();
