
const { sql, poolPromise } = require('./server/dbConfig');

async function checkColumns() {
    try {
        const pool = await poolPromise;
        const resultSE = await pool.request().query("SELECT TOP 1 * FROM Master_ConcernedSE");
        console.log("Master_ConcernedSE Columns:", Object.keys(resultSE.recordset[0] || {}));

        const resultEF = await pool.request().query("SELECT TOP 1 * FROM Master_EnquiryFor");
        console.log("Master_EnquiryFor Columns:", Object.keys(resultEF.recordset[0] || {}));

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

checkColumns();
