const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query("SELECT DISTINCT ProbabilityOption, Probability FROM EnquiryMaster WHERE ProbabilityOption IS NOT NULL");
        fs.writeFileSync('prob_options_out.txt', JSON.stringify(res.recordset, null, 2));
        console.log("Written to prob_options_out.txt");
    } catch (err) {
        console.error(err);
        fs.writeFileSync('prob_options_out.txt', 'Error: ' + err.message);
    }
    process.exit(0);
};

run();
