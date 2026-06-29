const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

const run = async () => {
    try {
        await connectDB();
        const reqNo = '21';

        const seRes = await new sql.Request().query(`
            SELECT * FROM ConcernedSE WHERE RequestNo = '${reqNo}'
        `);

        fs.writeFileSync('debug_se_result.json', JSON.stringify(seRes.recordset, null, 2));

    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();
