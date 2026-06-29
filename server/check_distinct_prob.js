require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

async function checkProb() {
    try {
        await connectDB();
        const result = await sql.query(`
            SELECT DISTINCT Probability, ProbabilityOption 
            FROM EnquiryMaster 
            WHERE ProbabilityOption IS NOT NULL AND ProbabilityOption <> ''
        `);
        console.log("Distinct Probability Data:", result.recordset);
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

checkProb();
