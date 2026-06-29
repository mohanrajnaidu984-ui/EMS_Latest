const { connectDB, sql } = require('./dbConfig');
const fs = require('fs');

async function test() {
    try {
        await connectDB();
        const result = await sql.query('SELECT EmailId, FullName, Department, Roles FROM Master_ConcernedSE WHERE EmailId = \'electrical@almoayyedcg.com\'');
        const user = result.recordset[0];
        const out = `DEPT: ${user.Department}\nROLES: ${user.Roles}\n`;
        fs.writeFileSync('user_info_clean.txt', out);
        console.log('Saved to user_info_clean.txt');
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

test();
