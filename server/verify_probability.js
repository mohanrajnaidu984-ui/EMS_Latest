require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

async function checkProbability() {
    try {
        await connectDB();
        const result = await sql.query(`
            SELECT TOP 20 Probability, ProbabilityOption 
            FROM EnquiryMaster 
            WHERE Probability IS NOT NULL
        `);
        console.log("Probability Sample Data:", result.recordset);
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

checkProbability();
