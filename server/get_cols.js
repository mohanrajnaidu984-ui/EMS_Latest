require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

(async () => {
    try {
        await connectDB();
        const res = await sql.query("SELECT TOP 1 * FROM EnquiryQuotes");
        if (res.recordset.length > 0) {
            console.log(Object.keys(res.recordset[0]));
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
})();
