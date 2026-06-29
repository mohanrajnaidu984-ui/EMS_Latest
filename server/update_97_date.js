require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

(async () => {
    try {
        await connectDB();
        console.log("Connected to DB");

        // Set date to 7 days ago
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 7);
        const dateStr = pastDate.toISOString().split('T')[0];

        await sql.query`UPDATE EnquiryQuotes SET QuoteDate = ${dateStr} WHERE RequestNo = '97'`;
        console.log(`Updated Quote for RequestNo 97 to ${dateStr}`);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
})();
